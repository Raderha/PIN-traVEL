/**
 * TourAPI 원본 데이터를 MongoDB raw 컬렉션에 적재하는 스크립트.
 *
 * 저장 컬렉션(요구사항):
 * - festivals_raw: 축제 목록 원본
 * - festival_details_raw: 축제 상세 원본(detailCommon2 + detailIntro2)
 * - places_raw: 관광지 목록 원본
 * - place_details_raw: 관광지 상세 원본(detailCommon2 + detailIntro2)
 *
 * 실행:
 * - node src/scripts/syncTourApiRaw.js
 *
 * 환경변수:
 * - TOUR_API_KEY
 * - MONGODB_URI (예: mongodb://127.0.0.1:27017/pintravel)
 */
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const TOUR_API_BASE = "https://apis.data.go.kr/B551011/KorService2";
const MOBILE_OS = "ETC";
const MOBILE_APP = "pintravel";
const REGION_LDONG_REGN_CD = "26"; // 부산 고정

const DEFAULTS = {
  festivals: {
    eventStartDate: "20260101",
    pageNo: 1,
    numOfRows: 50,
  },
  places: {
    pageNo: 1,
    numOfRows: 100,
    contentTypeId: "12",
  },
  concurrency: 4,
  requestTimeoutMs: 20000,
  politeDelayMs: 150, // TourAPI 과부하 방지용 최소 딜레이
};

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildUrl(path, params) {
  const url = new URL(`${TOUR_API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  return url.toString();
}

async function fetchJson(url, { timeoutMs } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULTS.requestTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}\n${body}`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function normalizeItems(json) {
  // TourAPI 응답: response.body.items.item (없을 수도/1개면 객체일 수도)
  const item = json?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function promisePool(items, concurrency, worker) {
  const results = new Array(items.length);
  let idx = 0;
  let inFlight = 0;

  return await new Promise((resolve, reject) => {
    const launchNext = () => {
      while (inFlight < concurrency && idx < items.length) {
        const cur = idx++;
        inFlight++;
        Promise.resolve(worker(items[cur], cur))
          .then((r) => {
            results[cur] = r;
            inFlight--;
            if (idx >= items.length && inFlight === 0) resolve(results);
            else launchNext();
          })
          .catch(reject);
      }
    };
    launchNext();
  });
}

async function upsertListRaw(col, { kind, pageNo, numOfRows, url, items }) {
  if (items.length === 0) return { insertedOrUpdated: 0 };

  const ops = items.map((doc) => ({
    updateOne: {
      filter: {
        kind,
        contentId: String(doc.contentid ?? doc.contentId ?? ""),
      },
      update: {
        $set: {
          kind,
          contentId: String(doc.contentid ?? doc.contentId ?? ""),
          contentTypeId: doc.contenttypeid ? String(doc.contenttypeid) : undefined,
          raw: doc,
          fetchedAt: new Date(),
          source: { url, pageNo, numOfRows },
        },
      },
      upsert: true,
    },
  }));

  const r = await col.bulkWrite(ops, { ordered: false });
  return { insertedOrUpdated: (r.upsertedCount ?? 0) + (r.modifiedCount ?? 0) };
}

async function upsertDetailRaw(col, { kind, contentId, contentTypeId, common, intro, source }) {
  await col.updateOne(
    { kind, contentId: String(contentId) },
    {
      $set: {
        kind,
        contentId: String(contentId),
        contentTypeId: contentTypeId ? String(contentTypeId) : undefined,
        commonRaw: common,
        introRaw: intro,
        fetchedAt: new Date(),
        source,
      },
    },
    { upsert: true }
  );
}

async function fetchFestivalListPage({ serviceKey, pageNo, numOfRows, eventStartDate }) {
  const url = buildUrl("searchFestival2", {
    serviceKey,
    MobileOS: MOBILE_OS,
    MobileApp: MOBILE_APP,
    eventStartDate,
    pageNo,
    numOfRows,
    _type: "json",
    lDongRegnCd: REGION_LDONG_REGN_CD,
  });
  const json = await fetchJson(url);
  const totalCount = Number(json?.response?.body?.totalCount ?? 0);
  return { url, json, items: normalizeItems(json), totalCount };
}

async function fetchPlacesListPage({ serviceKey, pageNo, numOfRows, contentTypeId }) {
  const url = buildUrl("areaBasedList2", {
    serviceKey,
    MobileOS: MOBILE_OS,
    MobileApp: MOBILE_APP,
    _type: "json",
    lDongRegnCd: REGION_LDONG_REGN_CD,
    contentTypeId,
    pageNo,
    numOfRows,
  });
  const json = await fetchJson(url);
  const totalCount = Number(json?.response?.body?.totalCount ?? 0);
  return { url, json, items: normalizeItems(json), totalCount };
}

async function fetchDetailCommon({ serviceKey, contentId }) {
  const url = buildUrl("detailCommon2", {
    serviceKey,
    MobileOS: MOBILE_OS,
    MobileApp: MOBILE_APP,
    _type: "json",
    contentId,
  });
  const json = await fetchJson(url);
  const items = normalizeItems(json);
  return { url, json, item: items[0] ?? null };
}

async function fetchDetailIntro({ serviceKey, contentId, contentTypeId }) {
  const url = buildUrl("detailIntro2", {
    serviceKey,
    MobileOS: MOBILE_OS,
    MobileApp: MOBILE_APP,
    _type: "json",
    contentId,
    ...(contentTypeId ? { contentTypeId } : {}),
  });
  const json = await fetchJson(url);
  const items = normalizeItems(json);
  return { url, json, item: items[0] ?? null };
}

async function syncKind({
  kind,
  listFetcher,
  listRawCollection,
  detailsRawCollection,
  serviceKey,
  listParams,
  contentTypeIdForIntro,
  concurrency,
}) {
  let pageNo = listParams.pageNo ?? 1;
  const numOfRows = listParams.numOfRows;
  let totalListItems = 0;
  const contentIds = new Map(); // contentId -> contentTypeId

  for (;;) {
    // 주의: listParams에 pageNo/numOfRows가 포함돼 있으면 덮어써질 수 있으므로
    // 항상 "현재 루프의 pageNo/numOfRows"를 마지막에 넣어 우선시한다.
    const page = await listFetcher({ serviceKey, ...listParams, pageNo, numOfRows });
    const items = page.items;
    const totalCount = Number(page.totalCount ?? 0);
    const maxPages =
      Number.isFinite(totalCount) && totalCount > 0 ? Math.ceil(totalCount / numOfRows) : null;

    console.log(
      `[${kind}] list page=${pageNo}${maxPages ? `/${maxPages}` : ""} items=${items.length}${
        totalCount ? ` totalCount=${totalCount}` : ""
      }`
    );

    if (items.length === 0) break;

    totalListItems += items.length;
    for (const it of items) {
      const cid = String(it.contentid ?? it.contentId ?? "");
      if (!cid) continue;
      const ctid = it.contenttypeid ? String(it.contenttypeid) : contentTypeIdForIntro;
      if (!contentIds.has(cid)) contentIds.set(cid, ctid);
    }

    await upsertListRaw(listRawCollection, {
      kind,
      pageNo,
      numOfRows,
      url: page.url,
      items,
    });

    if (items.length < numOfRows) break;
    if (maxPages && pageNo >= maxPages) break;

    pageNo += 1;
    if (pageNo > 200) throw new Error(`[${kind}] page limit exceeded (possible pagination loop)`);
    await sleep(DEFAULTS.politeDelayMs);
  }

  const ids = [...contentIds.entries()].map(([contentId, contentTypeId]) => ({
    contentId,
    contentTypeId,
  }));

  let done = 0;
  await promisePool(ids, concurrency, async ({ contentId, contentTypeId }) => {
    const common = await fetchDetailCommon({ serviceKey, contentId });
    await sleep(DEFAULTS.politeDelayMs);
    const intro = await fetchDetailIntro({
      serviceKey,
      contentId,
      contentTypeId,
    });

    await upsertDetailRaw(detailsRawCollection, {
      kind,
      contentId,
      contentTypeId,
      common: common.json,
      intro: intro.json,
      source: {
        commonUrl: common.url,
        introUrl: intro.url,
      },
    });

    done += 1;
    if (done % 25 === 0) {
      console.log(`[${kind}] details synced: ${done}/${ids.length}`);
    }

    await sleep(DEFAULTS.politeDelayMs);
  });

  console.log(
    `[${kind}] list items=${totalListItems}, distinct contentIds=${ids.length}, details synced=${ids.length}`
  );
}

async function main() {
  const serviceKey = requireEnv("TOUR_API_KEY");
  const mongoUri = requireEnv("MONGODB_URI");

  const client = new MongoClient(mongoUri);
  await client.connect();

  const dbName = new URL(mongoUri).pathname.replace("/", "") || "pintravel";
  const db = client.db(dbName);

  const festivalsRaw = db.collection("festivals_raw");
  const festivalDetailsRaw = db.collection("festival_details_raw");
  const placesRaw = db.collection("places_raw");
  const placeDetailsRaw = db.collection("place_details_raw");

  await Promise.all([
    festivalsRaw.createIndex({ kind: 1, contentId: 1 }, { unique: true }),
    festivalDetailsRaw.createIndex({ kind: 1, contentId: 1 }, { unique: true }),
    placesRaw.createIndex({ kind: 1, contentId: 1 }, { unique: true }),
    placeDetailsRaw.createIndex({ kind: 1, contentId: 1 }, { unique: true }),
  ]);

  const concurrency = Number(process.env.TOUR_SYNC_CONCURRENCY ?? DEFAULTS.concurrency);

  console.log(`[sync] MongoDB=${db.databaseName}`);
  console.log(`[sync] lDongRegnCd=${REGION_LDONG_REGN_CD} (Busan)`);
  console.log(`[sync] concurrency=${concurrency}`);

  await syncKind({
    kind: "festival",
    listFetcher: fetchFestivalListPage,
    listRawCollection: festivalsRaw,
    detailsRawCollection: festivalDetailsRaw,
    serviceKey,
    listParams: {
      eventStartDate: process.env.TOUR_EVENT_START_DATE ?? DEFAULTS.festivals.eventStartDate,
      pageNo: DEFAULTS.festivals.pageNo,
      numOfRows: DEFAULTS.festivals.numOfRows,
    },
    contentTypeIdForIntro: "15",
    concurrency,
  });

  await syncKind({
    kind: "place",
    listFetcher: fetchPlacesListPage,
    listRawCollection: placesRaw,
    detailsRawCollection: placeDetailsRaw,
    serviceKey,
    listParams: {
      contentTypeId: DEFAULTS.places.contentTypeId,
      pageNo: DEFAULTS.places.pageNo,
      numOfRows: DEFAULTS.places.numOfRows,
    },
    contentTypeIdForIntro: "12",
    concurrency,
  });

  await client.close();
  console.log("[sync] done");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
