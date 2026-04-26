/**
 * Raw 컬렉션을 서비스용 컬렉션으로 머지/정규화하는 스크립트.
 *
 * 필요 : MongoDB 설치, pintravel 데이터베이스 생성 후 
 * 
 * db.createUser({
 * user: "사용자이름",
 * pwd: "비밀번호 설정",
 * roles: [{ role: "readWrite", db: "pintravel" }]
 * }) -> 사용자 생성 및 비밀번호 설정()

 * 
 * 입력:
 * - places_raw (문서 예: { kind, contentId, raw, fetchedAt, ... })
 * - place_details_raw (문서 예: { kind, contentId, commonRaw, introRaw, ... })
 * - festivals_raw
 * - festival_details_raw
 *
 * 출력(서비스용):
 * - places
 * - festivals
 *
 * 실행:
 * - node src/scripts/buildServiceCollections.js
 * - node src/scripts/buildServiceCollections.js --drop   (기존 places/festivals 컬렉션 drop 후 재생성)
 *
 * 필요 환경변수:
 * - MONGODB_URI (예: mongodb://127.0.0.1:27017/pintravel)
 */
import dotenv from "dotenv";
import { connectMongo, closeMongo } from "../storage/mongo.js";

dotenv.config();

const args = new Set(process.argv.slice(2));
const shouldDrop = args.has("--drop");

function asString(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function pick(obj, keys) {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).length) return v;
  }
  return null;
}

function firstTourApiItem(raw) {
  const item = raw?.response?.body?.items?.item;
  if (!item) return raw ?? null;
  return Array.isArray(item) ? item[0] ?? null : item;
}

function toIsoDateMaybe(compact) {
  // TourAPI는 보통 YYYYMMDD. 이미 YYYY-MM-DD면 그대로 유지.
  const s = asString(compact);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return s;
}

function pointFromMapXY(mapx, mapy) {
  const lng = asNumber(mapx);
  const lat = asNumber(mapy);
  if (lng === null || lat === null) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

function regionFromRaw(listRaw) {
  // TourAPI: 호출 방식/엔드포인트에 따라 키가 다를 수 있어 양쪽을 모두 흡수
  const lDongRegnCdRaw = asString(pick(listRaw, ["ldongregncd", "lDongRegnCd", "l_dong_regn_cd"]));
  const lDongSignguCdRaw = asString(pick(listRaw, ["ldongsigungucd", "lDongSignguCd", "l_dong_signgu_cd"]));
  const areaCode = asString(pick(listRaw, ["areacode", "areaCode"]));
  const sigunguCode = asString(pick(listRaw, ["sigungucode", "sigunguCode"]));

  // 고정 자리수로 맞춤(시도 2자리, 시군구 3자리). 예: 26 + 440 => 26440
  const lDongRegnCd = lDongRegnCdRaw ? lDongRegnCdRaw.padStart(2, "0") : null;
  const lDongSignguCd = lDongSignguCdRaw ? lDongSignguCdRaw.padStart(3, "0") : null;

  const idongCode = lDongRegnCd && lDongSignguCd ? `${lDongRegnCd}${lDongSignguCd}` : lDongRegnCd ? lDongRegnCd : null;

  return {
    idongCode,
    idong: { regnCd: lDongRegnCd, signguCd: lDongSignguCd },
    area: { areaCode, sigunguCode },
  };
}

function placeDoc({ listRaw, commonRaw, introRaw, source }) {
  const common = firstTourApiItem(commonRaw);
  const intro = firstTourApiItem(introRaw);
  const contentId = asString(pick(listRaw, ["contentid", "contentId"])) ?? asString(listRaw?.contentId);
  if (!contentId) return null;

  const contentTypeId = asString(pick(listRaw, ["contenttypeid", "contentTypeId"])) ?? asString(pick(common, ["contenttypeid", "contentTypeId"]));
  const title = asString(pick(common, ["title"])) ?? asString(pick(listRaw, ["title"]));
  const mapx = pick(listRaw, ["mapx"]) ?? pick(common, ["mapx"]);
  const mapy = pick(listRaw, ["mapy"]) ?? pick(common, ["mapy"]);
  const addr1 = asString(pick(common, ["addr1"])) ?? asString(pick(listRaw, ["addr1"]));
  const addr2 = asString(pick(common, ["addr2"])) ?? asString(pick(listRaw, ["addr2"]));
  const firstimage = asString(pick(listRaw, ["firstimage"])) ?? asString(pick(common, ["firstimage"]));
  const firstimage2 = asString(pick(listRaw, ["firstimage2"])) ?? asString(pick(common, ["firstimage2"]));
  const tel = asString(pick(common, ["tel"])) ?? asString(pick(listRaw, ["tel"]));
  const cat1 = asString(pick(common, ["cat1"])) ?? asString(pick(listRaw, ["cat1"]));
  const cat2 = asString(pick(common, ["cat2"])) ?? asString(pick(listRaw, ["cat2"]));
  const cat3 = asString(pick(common, ["cat3"])) ?? asString(pick(listRaw, ["cat3"]));
  const zipcode = asString(pick(common, ["zipcode"])) ?? asString(pick(listRaw, ["zipcode"]));

  const overview = asString(pick(common, ["overview"])) ?? asString(pick(intro, ["overview"]));

  // 운영정보 필드는 commonRaw/introRaw 어느 쪽에 있을지 몰라서 둘 다 탐색
  const infocenter = asString(pick(common, ["infocenter"])) ?? asString(pick(intro, ["infocenter"]));
  const usetime = asString(pick(common, ["usetime"])) ?? asString(pick(intro, ["usetime"]));
  const restdate = asString(pick(common, ["restdate"])) ?? asString(pick(intro, ["restdate"]));
  const parking = asString(pick(common, ["parking"])) ?? asString(pick(intro, ["parking"]));
  const usefee = asString(pick(common, ["usefee"])) ?? asString(pick(intro, ["usefee"]));

  const region = regionFromRaw(listRaw);
  if (region.idong?.regnCd !== "26" && !region.idongCode?.startsWith("26")) return null;

  return {
    contentId,
    contentTypeId,
    title,
    ...region,
    category: { cat1, cat2, cat3 },
    address: { addr1, addr2 },
    zipcode,
    location: pointFromMapXY(mapx, mapy),
    image: firstimage,
    images: { firstimage, firstimage2 },
    tel,
    infoCenter: infocenter,
    overview,
    useTime: usetime,
    restDate: restdate,
    parking,
    fee: usefee,
    source,
  };
}

function festivalDoc({ listRaw, commonRaw, introRaw }) {
  const contentId = asString(pick(listRaw, ["contentid", "contentId"])) ?? asString(listRaw?.contentId);
  if (!contentId) return null;

  const title = asString(pick(listRaw, ["title"]));
  const startDate = toIsoDateMaybe(pick(listRaw, ["eventstartdate", "eventStartDate"]));
  const endDate = toIsoDateMaybe(pick(listRaw, ["eventenddate", "eventEndDate"]));

  const mapx = pick(listRaw, ["mapx"]);
  const mapy = pick(listRaw, ["mapy"]);
  const addr1 = asString(pick(listRaw, ["addr1"]));
  const addr2 = asString(pick(listRaw, ["addr2"]));
  const firstimage = asString(pick(listRaw, ["firstimage", "firstimage2"]));
  const tel = asString(pick(listRaw, ["tel"]));

  const overview = asString(pick(commonRaw, ["overview"])) ?? asString(pick(introRaw, ["overview"]));

  // 축제 intro
  const eventplace = asString(pick(introRaw, ["eventplace", "eventPlace"])) ?? asString(pick(commonRaw, ["eventplace", "eventPlace"]));
  const playtime = asString(pick(introRaw, ["playtime", "playTime"])) ?? asString(pick(commonRaw, ["playtime", "playTime"]));
  const eventcost = asString(pick(introRaw, ["eventcost", "eventCost"])) ?? asString(pick(commonRaw, ["eventcost", "eventCost"]));

  const region = regionFromRaw(listRaw);

  return {
    contentId,
    title,
    ...region,
    startDate,
    endDate,
    address: { addr1, addr2 },
    location: pointFromMapXY(mapx, mapy),
    image: firstimage,
    tel,
    overview,
    eventPlace: eventplace,
    useTime: playtime,
    fee: eventcost,
  };
}

async function ensureIndexes(db) {
  await db.collection("places").createIndex({ contentId: 1 }, { unique: true, name: "uniq_contentId" });
  await db.collection("places").createIndex({ location: "2dsphere" }, { name: "geo_location" });
  await db.collection("places").createIndex({ idongCode: 1 }, { name: "idx_idongCode" });

  await db.collection("festivals").createIndex({ contentId: 1 }, { unique: true, name: "uniq_contentId" });
  await db.collection("festivals").createIndex({ location: "2dsphere" }, { name: "geo_location" });
  await db.collection("festivals").createIndex({ startDate: 1, endDate: 1 }, { name: "date_range" });
  await db.collection("festivals").createIndex({ idongCode: 1 }, { name: "idx_idongCode" });
}

async function rebuildPlaces(db) {
  const placesRawCol = db.collection("places_raw");
  const placeDetailsCol = db.collection("place_details_raw");
  const placesCol = db.collection("places");

  const cursor = placesRawCol.find(
    {
      $or: [
        { "raw.lDongRegnCd": "26" },
        { "raw.ldongregncd": "26" },
        { "raw.l_dong_regn_cd": "26" },
      ],
    },
    { projection: { contentId: 1, raw: 1, contentTypeId: 1, source: 1 } }
  );
  let processed = 0;
  let written = 0;
  const ops = [];

  for await (const row of cursor) {
    processed++;
    const contentId = asString(row.contentId);
    const listRaw = row.raw ?? null;
    if (!contentId || !listRaw) continue;

    const details = await placeDetailsCol.findOne({ contentId }, { projection: { commonRaw: 1, introRaw: 1, source: 1 } });
    const doc = placeDoc({
      listRaw,
      commonRaw: details?.commonRaw ?? null,
      introRaw: details?.introRaw ?? null,
      source: {
        list: row.source ?? null,
        details: details?.source ?? null,
      },
    });
    if (!doc) continue;

    ops.push({
      updateOne: {
        filter: { contentId: doc.contentId },
        update: { $set: doc },
        upsert: true,
      },
    });

    if (ops.length >= 500) {
      const r = await placesCol.bulkWrite(ops, { ordered: false });
      written += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) + (r.matchedCount ?? 0);
      ops.length = 0;
    }
  }

  if (ops.length) {
    const r = await placesCol.bulkWrite(ops, { ordered: false });
    written += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) + (r.matchedCount ?? 0);
  }

  return { processed, written };
}

async function rebuildFestivals(db) {
  const festivalsRawCol = db.collection("festivals_raw");
  const festivalDetailsCol = db.collection("festival_details_raw");
  const festivalsCol = db.collection("festivals");

  const cursor = festivalsRawCol.find({}, { projection: { contentId: 1, raw: 1 } });
  let processed = 0;
  let written = 0;
  const ops = [];

  for await (const row of cursor) {
    processed++;
    const contentId = asString(row.contentId);
    const listRaw = row.raw ?? null;
    if (!contentId || !listRaw) continue;

    const details = await festivalDetailsCol.findOne({ contentId }, { projection: { commonRaw: 1, introRaw: 1 } });
    const doc = festivalDoc({ listRaw, commonRaw: details?.commonRaw ?? null, introRaw: details?.introRaw ?? null });
    if (!doc) continue;

    ops.push({
      updateOne: {
        filter: { contentId: doc.contentId },
        update: { $set: doc },
        upsert: true,
      },
    });

    if (ops.length >= 500) {
      const r = await festivalsCol.bulkWrite(ops, { ordered: false });
      written += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) + (r.matchedCount ?? 0);
      ops.length = 0;
    }
  }

  if (ops.length) {
    const r = await festivalsCol.bulkWrite(ops, { ordered: false });
    written += (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) + (r.matchedCount ?? 0);
  }

  return { processed, written };
}

async function main() {
  const { db } = await connectMongo();

  if (shouldDrop) {
    const existing = await db.listCollections({}, { nameOnly: true }).toArray();
    const names = new Set(existing.map((c) => c.name));
    if (names.has("places")) await db.collection("places").drop();
    if (names.has("festivals")) await db.collection("festivals").drop();
  }

  const placesResult = await rebuildPlaces(db);
  const festivalsResult = await rebuildFestivals(db);
  await ensureIndexes(db);

  console.log("[buildServiceCollections] done");
  console.log({ places: placesResult, festivals: festivalsResult, dropped: shouldDrop });
}

main()
  .catch((e) => {
    console.error("[buildServiceCollections] failed", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMongo().catch(() => {});
  });

