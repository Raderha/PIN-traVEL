/**
 * 부산 숙소/식당 TourAPI 데이터를 MongoDB 컬렉션에 적재하는 스크립트.
 *
 * 출력 컬렉션:
 * - hotel: 부산 숙소(contentTypeId=32)
 * - food: 부산 식당(contentTypeId=39)
 *
 * 실행:
 * - npm run sync:busan:hotel-food -w @pintravel/api
 *
 * 필요 환경변수:
 * - TOUR_API_KEY
 * - MONGODB_URI
 */
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

import { closeMongo, connectMongo } from "../storage/mongo.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const TOUR_API_BASE = "https://apis.data.go.kr/B551011/KorService2";
const BUSAN_LDONG_REGN_CD = "26";
const MOBILE_OS = "ETC";
const MOBILE_APP = "pintravel";
const NUM_OF_ROWS = 10;

const TARGETS = [
  { collectionName: "hotel", label: "부산 숙소", contentTypeId: "32" },
  { collectionName: "food", label: "부산 식당", contentTypeId: "39" },
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function buildAreaBasedListUrl({ serviceKey, contentTypeId, pageNo }) {
  const url = new URL(`${TOUR_API_BASE}/areaBasedList2`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("MobileOS", MOBILE_OS);
  url.searchParams.set("MobileApp", MOBILE_APP);
  url.searchParams.set("_type", "json");
  url.searchParams.set("lDongRegnCd", BUSAN_LDONG_REGN_CD);
  url.searchParams.set("contentTypeId", contentTypeId);
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(NUM_OF_ROWS));
  return url;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TourAPI request failed: HTTP ${res.status} ${res.statusText}\n${body}`);
  }

  return await res.json();
}

function normalizeItems(json) {
  const item = json?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

function getTotalCount(json) {
  const totalCount = Number(json?.response?.body?.totalCount ?? 0);
  return Number.isFinite(totalCount) ? totalCount : 0;
}

function asString(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function pointFromMapXY(mapx, mapy) {
  const lng = asNumber(mapx);
  const lat = asNumber(mapy);
  if (lng === null || lat === null) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

function toTourDoc(raw, { label, collectionName, contentTypeId, sourceUrl, pageNo }) {
  const contentId = asString(raw.contentid ?? raw.contentId);
  if (!contentId) return null;

  return {
    contentId,
    kind: collectionName,
    label,
    contentTypeId: asString(raw.contenttypeid ?? raw.contentTypeId) ?? contentTypeId,
    title: asString(raw.title),
    category: {
      cat1: asString(raw.cat1),
      cat2: asString(raw.cat2),
      cat3: asString(raw.cat3),
    },
    address: {
      addr1: asString(raw.addr1),
      addr2: asString(raw.addr2),
    },
    tel: asString(raw.tel),
    zipcode: asString(raw.zipcode),
    location: pointFromMapXY(raw.mapx, raw.mapy),
    image: asString(raw.firstimage),
    images: {
      firstimage: asString(raw.firstimage),
      firstimage2: asString(raw.firstimage2),
    },
    raw,
    fetchedAt: new Date(),
    source: {
      name: "TourAPI areaBasedList2",
      url: sourceUrl,
      lDongRegnCd: BUSAN_LDONG_REGN_CD,
      pageNo,
      numOfRows: NUM_OF_ROWS,
    },
  };
}

async function fetchTargetPage(target, serviceKey, pageNo) {
  const url = buildAreaBasedListUrl({ serviceKey, contentTypeId: target.contentTypeId, pageNo });
  const json = await fetchJson(url);
  return {
    url,
    json,
    items: normalizeItems(json),
    totalCount: getTotalCount(json),
  };
}

async function upsertItems(collection, target, page) {
  const docs = page.items
    .map((raw) => toTourDoc(raw, { ...target, sourceUrl: page.url.toString(), pageNo: page.pageNo }))
    .filter(Boolean);

  if (docs.length === 0) {
    return { written: 0 };
  }

  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { contentId: doc.contentId },
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await collection.bulkWrite(ops, { ordered: false });
  const written = (result.upsertedCount ?? 0) + (result.modifiedCount ?? 0) + (result.matchedCount ?? 0);

  return { written };
}

async function syncTarget(db, target, serviceKey) {
  const collection = db.collection(target.collectionName);

  await collection.createIndex({ contentId: 1 }, { unique: true, name: "uniq_contentId" });
  await collection.createIndex({ location: "2dsphere" }, { name: "geo_location" });

  let pageNo = 1;
  let fetched = 0;
  let written = 0;
  let totalCount = 0;

  for (;;) {
    const page = await fetchTargetPage(target, serviceKey, pageNo);
    const items = page.items;
    totalCount = page.totalCount;
    const maxPages = totalCount > 0 ? Math.ceil(totalCount / NUM_OF_ROWS) : null;

    console.log(
      `[${target.collectionName}] page=${pageNo}${maxPages ? `/${maxPages}` : ""} items=${items.length}${
        totalCount ? ` totalCount=${totalCount}` : ""
      }`
    );

    if (items.length === 0) break;

    fetched += items.length;
    const result = await upsertItems(collection, target, { ...page, pageNo });
    written += result.written;

    if (items.length < NUM_OF_ROWS) break;
    if (maxPages && pageNo >= maxPages) break;

    pageNo += 1;
    if (pageNo > 500) throw new Error(`[${target.collectionName}] page limit exceeded`);
  }

  console.log(`[${target.collectionName}] fetched=${fetched}, written=${written}, totalCount=${totalCount}`);
  return { fetched, written, totalCount };
}

async function main() {
  const serviceKey = requireEnv("TOUR_API_KEY");
  const { db } = await connectMongo();

  console.log(`[syncBusanHotelFood] MongoDB=${db.databaseName}`);

  const results = {};
  for (const target of TARGETS) {
    results[target.collectionName] = await syncTarget(db, target, serviceKey);
  }

  console.log("[syncBusanHotelFood] done", results);
}

main()
  .catch((err) => {
    console.error("[syncBusanHotelFood] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo().catch(() => {});
  });
