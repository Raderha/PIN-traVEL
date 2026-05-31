import { geminiNormalizeToRoadAddressWithDebug } from "./geminiRoadAddress.js";

/** NCP Maps 공식 호스트(https://api.ncloud-docs.com/docs/application-maps-overview) */
const MAPS_APIGW_BASE = "https://maps.apigw.ntruss.com";
const GEOCODE_URL = `${MAPS_APIGW_BASE}/map-geocode/v2/geocode`;
const DIRECTIONS_URL = `${MAPS_APIGW_BASE}/map-direction-15/v1/driving`;

const ROUTE_OPTION_KEYS = ["traoptimal", "trafast", "tracomfort", "traavoidtoll", "traavoidcaronly"];

/**
 * Geocoding API는 "주소" 검색에 가깝고, 역·랜드마크 지명만으로는 결과가 비는 경우가 많아
 * 자주 쓰는 출발지는 도로명 주소로 한 번 더 시도한다.
 * 키: 공백 제거한 정규화 문자열
 */
const GEOCODE_PLACE_ALIASES = Object.freeze({
  서울역: "서울특별시 용산구 한강대로 지하 405",
  서울터미널: "서울특별시 서초구 신반포로 194",
  서울고속버스터미널: "서울특별시 서초구 신반포로 194",
  고속터미널: "서울특별시 서초구 신반포로 194",
  강남고속버스터미널: "서울특별시 서초구 신반포로 194",
  용산역: "서울특별시 용산구 한강대로 23길 55",
  강남역: "서울특별시 강남구 강남대로 396",
  홍대입구역: "서울특별시 마포구 양화로 188",
  부산역: "부산광역시 동구 중앙대로 206",
  대구역: "대구광역시 북구 태평로 161",
  대전역: "대전광역시 동구 중앙로 215",
  광주역: "광주광역시 동구 중앙로 149",
  목포역: "전라남도 목포시 영산로 98",
  수원역: "경기도 수원시 팔달구 덕영대로 924",
  인천공항1터미널: "인천광역시 중구 공항로 272",
  인천공항2터미널: "인천광역시 중구 공항로 424",
  김포공항: "서울특별시 강서구 하늘길 38",
  제주공항: "제주특별자치도 제주시 공항로 2",
  /** 한국해양대학교 목포캠퍼스(구 국립목포해양대 등) — 도로명만 주면 지오코딩 누락되는 사례 방지 */
  목포해양대: "전라남도 목포시 해양대학로 91",
  목포해양대학교: "전라남도 목포시 해양대학로 91",
  한국해양대학교목포캠퍼스: "전라남도 목포시 해양대학로 91",
  한국해양대목포: "전라남도 목포시 해양대학로 91",
});

function compactQueryKey(q) {
  return String(q).trim().replace(/\s+/g, "");
}

function formatLngLat(lat, lng) {
  return `${lng},${lat}`;
}

function isSameLocation(a, b) {
  return Number(a.lat) === Number(b.lat) && Number(a.lng) === Number(b.lng);
}

async function ncpGetJson(url, { keyId, key }, signal) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-ncp-apigw-api-key-id": keyId,
      "x-ncp-apigw-api-key": key,
      Accept: "application/json",
    },
    signal,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    const err = new Error(`INVALID_JSON_${res.status}`);
    err.ncpHttpStatus = res.status;
    throw err;
  }
  if (!res.ok) {
    const msg = data?.errorMessage || data?.message || `HTTP_${res.status}`;
    const err = new Error(typeof msg === "string" ? msg : `HTTP_${res.status}`);
    err.ncpHttpStatus = res.status;
    err.ncpErrorCode = data?.errorCode ?? data?.code;
    throw err;
  }
  return data;
}

/**
 * @param {string} query
 * @param {{ keyId: string, key: string }} credentials
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ lat: number; lng: number; roadAddress: string | null; jibunAddress: string | null } | null>}
 */
async function geocodeAddressOnce(query, credentials, signal) {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("query", query.trim());
  url.searchParams.set("language", "kor");
  const data = await ncpGetJson(url.toString(), credentials, signal);
  const hasList = Array.isArray(data.addresses) && data.addresses.length > 0;
  if (!hasList) return null;
  const st = String(data.status ?? "").trim().toUpperCase();
  if (st && st !== "OK") return null;
  const a = data.addresses[0];
  const lng = Number(a.x);
  const lat = Number(a.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    roadAddress: a.roadAddress ?? null,
    jibunAddress: a.jibunAddress ?? null,
  };
}

function buildGeocodeCandidates(raw) {
  const q0 = String(raw).trim();
  if (!q0) return [];
  const key = compactQueryKey(q0);
  const alias = GEOCODE_PLACE_ALIASES[key];
  const seen = new Set();
  const out = [];
  const push = (s) => {
    const t = String(s).trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  if (alias) push(alias);
  push(q0);
  push(`${q0}, 대한민국`);
  push(`대한민국 ${q0}`);
  return out;
}

/**
 * @param {string} query
 * @param {{ keyId: string, key: string }} credentials
 * @param {AbortSignal} [signal]
 * @returns {Promise<{ lat: number; lng: number; roadAddress: string | null; jibunAddress: string | null } | null>}
 */
export async function geocodeAddress(query, credentials, signal) {
  for (const cand of buildGeocodeCandidates(query)) {
    const hit = await geocodeAddressOnce(cand, credentials, signal);
    if (hit) return hit;
  }
  return null;
}

function pickRouteLeg(data) {
  if (typeof data.code === "number" && data.code !== 0) {
    const msg = data.message || `ROUTE_CODE_${data.code}`;
    const err = new Error(msg);
    err.ncpRouteCode = data.code;
    throw err;
  }
  const route = data.route;
  if (!route || typeof route !== "object") throw new Error("NO_ROUTE_OBJECT");
  for (const k of ROUTE_OPTION_KEYS) {
    const arr = route[k];
    if (Array.isArray(arr) && arr.length > 0) return arr[0];
  }
  throw new Error("NO_ROUTE_LEG");
}

/**
 * @param {{ lat: number; lng: number }} start
 * @param {{ lat: number; lng: number }} goal
 * @param {{ keyId: string; key: string }} credentials
 * @param {AbortSignal} [signal]
 */
export async function fetchDrivingSegment(start, goal, credentials, signal) {
  const url = new URL(DIRECTIONS_URL);
  url.searchParams.set("start", formatLngLat(start.lat, start.lng));
  url.searchParams.set("goal", formatLngLat(goal.lat, goal.lng));
  url.searchParams.set("option", "traoptimal");
  url.searchParams.set("lang", "ko");

  const data = await ncpGetJson(url.toString(), credentials, signal);
  const leg = pickRouteLeg(data);
  const pathRaw = leg.path;
  if (!Array.isArray(pathRaw)) throw new Error("NO_PATH");
  const path = pathRaw.map(([lng, lat]) => ({ lng: Number(lng), lat: Number(lat) }));
  return {
    distanceM: leg.summary?.distance ?? 0,
    durationMs: leg.summary?.duration ?? 0,
    path,
  };
}

/**
 * 출발지(문자열 지오코딩 또는 클라이언트가 넘긴 좌표) + 경유 없이 연속 구간별 Directions 15 호출
 * @param {{
 *   departureQuery: string;
 *   departureLat?: number;
 *   departureLng?: number;
 *   departureRoadAddress?: string | null;
 *   departureJibunAddress?: string | null;
 *   stops: Array<{ lat: number; lng: number; title: string }>;
 * }} params
 * @param {{ keyId: string; key: string }} credentials
 * @param {AbortSignal} [signal]
 * @param {{ geminiApiKey?: string }} [options]
 */
export async function buildItineraryDrivingRoute(params, credentials, signal, options = {}) {
  const { geminiApiKey } = options;
  const {
    departureQuery,
    departureLat,
    departureLng,
    departureRoadAddress,
    departureJibunAddress,
    stops,
  } = params;
  if (!departureQuery?.trim()) throw new Error("MISSING_DEPARTURE");
  if (!Array.isArray(stops) || stops.length === 0) throw new Error("MISSING_STOPS");

  /** @type {string | null} */
  let geminiRoadAddress = null;
  /** Gemini 디버그 메타(지오코딩 실패 시 API 응답에 포함) */
  let geminiDebug = null;

  let dep;
  if (Number.isFinite(departureLat) && Number.isFinite(departureLng)) {
    dep = {
      lat: departureLat,
      lng: departureLng,
      roadAddress: departureRoadAddress ?? null,
      jibunAddress: departureJibunAddress ?? null,
    };
  } else {
    let geocodeQuery = departureQuery.trim();
    const gKey = typeof geminiApiKey === "string" ? geminiApiKey.trim() : "";
    if (gKey) {
      geminiDebug = await geminiNormalizeToRoadAddressWithDebug(geocodeQuery, gKey, signal);
      if (geminiDebug.normalized) {
        geminiRoadAddress = geminiDebug.normalized;
        geocodeQuery = geminiDebug.normalized;
      }
    }
    let geocodeFallbackAttempted = null;
    dep = await geocodeAddress(geocodeQuery, credentials, signal);
    if (
      !dep &&
      geminiRoadAddress &&
      departureQuery.trim() !== geocodeQuery.trim()
    ) {
      geocodeFallbackAttempted = departureQuery.trim();
      dep = await geocodeAddress(geocodeFallbackAttempted, credentials, signal);
      if (dep) geocodeQuery = geocodeFallbackAttempted;
    }
    if (!dep) {
      const err = new Error("GEOCODE_NOT_FOUND");
      err.geocodeDebug = {
        departureQuery: departureQuery.trim(),
        geocodeQueryAttempted: geocodeQuery,
        geocodeFallbackAttempted,
        geminiRoadAddress,
        geminiRawModelText:
          geminiDebug?.rawModelText != null ? String(geminiDebug.rawModelText).slice(0, 2000) : null,
        geminiHttpStatus: geminiDebug?.geminiHttpStatus ?? null,
        geminiApiError: geminiDebug?.geminiApiError ?? null,
        geminiResponseSnippet:
          geminiDebug?.geminiResponseSnippet != null
            ? String(geminiDebug.geminiResponseSnippet).slice(0, 1200)
            : null,
        geminiModelsTried:
          geminiDebug?.geminiModelsTried != null
            ? String(geminiDebug.geminiModelsTried).slice(0, 1500)
            : null,
        geminiSkipped: !gKey ? true : Boolean(geminiDebug?.skipped),
        geminiModel: geminiDebug?.model ?? null,
      };
      throw err;
    }
  }

  const points = [
    { lat: dep.lat, lng: dep.lng, title: departureQuery.trim() },
    ...stops.map((s) => ({
      lat: s.lat,
      lng: s.lng,
      title: s.title?.trim() || "이름 없음",
    })),
  ];

  const mergedPath = [];
  const legs = [];
  /** 구간별 경로 좌표 — `legs[j]`와 동일 인덱스, 지도에서 일차별 시각화에 사용 */
  const legPaths = [];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    /** NCP Directions는 출발·도착 좌표가 같으면 code 1 — 연속 동일 좌표는 0m 구간으로 처리 */
    const seg = isSameLocation(a, b)
      ? { distanceM: 0, durationMs: 0, path: [] }
      : await fetchDrivingSegment(
          { lat: a.lat, lng: a.lng },
          { lat: b.lat, lng: b.lng },
          credentials,
          signal,
        );
    legs.push({
      fromTitle: a.title,
      toTitle: b.title,
      distanceM: seg.distanceM,
      durationMs: seg.durationMs,
    });
    legPaths.push(seg.path.map((p) => ({ lat: p.lat, lng: p.lng })));

    if (mergedPath.length === 0 && seg.path.length > 0) {
      mergedPath.push(...seg.path);
    } else if (seg.path.length > 0) {
      const last = mergedPath[mergedPath.length - 1];
      const first = seg.path[0];
      if (last && first && last.lat === first.lat && last.lng === first.lng) {
        mergedPath.push(...seg.path.slice(1));
      } else {
        mergedPath.push(...seg.path);
      }
    }
  }

  const totalDistanceM = legs.reduce((s, l) => s + l.distanceM, 0);
  const totalDurationMs = legs.reduce((s, l) => s + l.durationMs, 0);

  return {
    departure: {
      query: departureQuery.trim(),
      geminiRoadAddress,
      lat: dep.lat,
      lng: dep.lng,
      roadAddress: dep.roadAddress,
      jibunAddress: dep.jibunAddress,
    },
    stops: stops.map((s, idx) => ({ order: idx + 1, ...s })),
    path: mergedPath,
    legPaths,
    legs,
    totalDistanceM,
    totalDurationMs,
  };
}
