/**
 * 담당 유스케이스: UC5(여행 일정) — 경로 산출(Geocoding + Directions 15)
 * 역할: 출발지 문자열(Gemini로 도로명 정규화 가능) → 좌표 → Directions 15
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Router } from "express";
import { z } from "zod";

import { generateItineraryScheduleNarrative } from "../../services/geminiItineraryNarrative.js";
import { buildItineraryDrivingRoute } from "../../services/naverMapsRoute.js";

export const itineraryRouter = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const stopSchema = z.object({
  lat: z.number().finite(),
  lng: z.number().finite(),
  title: z.string().min(1).max(200),
  contentId: z.string().max(64).optional(),
  fee: z.string().max(500).nullable().optional(),
  time: z.string().max(500).nullable().optional(),
  kind: z.string().max(32).optional(),
});

const routeBodySchema = z
  .object({
    departureQuery: z.string().min(1).max(300),
    /** 브라우저 naver.maps.Service.geocode 결과 — 있으면 서버 REST 지오코딩 생략(VPC 전용 게이트웨이 회피) */
    departureLat: z.number().finite().optional(),
    departureLng: z.number().finite().optional(),
    departureRoadAddress: z.string().max(500).nullable().optional(),
    departureJibunAddress: z.string().max(500).nullable().optional(),
    stops: z.array(stopSchema).min(1).max(40),
  })
  .refine(
    (d) =>
      (d.departureLat == null && d.departureLng == null) ||
      (d.departureLat != null && d.departureLng != null),
    { message: "departureLat and departureLng must both be set", path: ["departureLat"] },
  );

const scheduleNarrativeBodySchema = z.object({
  tripStartDate: z.string().min(1).max(64),
  departureQuery: z.string().min(1).max(300),
  legs: z.array(
    z.object({
      fromTitle: z.string().max(300),
      toTitle: z.string().max(300),
      distanceM: z.number().finite(),
      durationMs: z.number().finite(),
    }),
  ),
  stops: z
    .array(
      z.object({
        order: z.number().int().positive(),
        title: z.string().max(200),
        dayIndex: z.number().int().min(0).max(99),
        fee: z.string().max(500).nullable().optional(),
        time: z.string().max(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(40),
});

/** .env에서 따옴표로 감싼 값이 그대로 들어가면 NCP가 401을 줄 수 있음 */
function normalizeEnvString(v) {
  if (v == null) return "";
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function envFirst(...keys) {
  for (const k of keys) {
    const v = normalizeEnvString(process.env[k]);
    if (v !== "") return v;
  }
  return undefined;
}

function parsedFirst(parsed, keys) {
  for (const k of keys) {
    const v = normalizeEnvString(parsed[k]);
    if (v !== "") return v;
  }
  return undefined;
}

/** NCP 문서 표기(하이픈)를 api .env에 그대로 쓸 때 우선 */
const NCP_KEY_ID_ENV_KEYS = [
  "X-NCP-APIGW-API-KEY-ID",
  "NCP_APIGW_API_KEY_ID",
  "X_NCP_APIGW_API_KEY_ID",
  "VITE_X_NCP_APIGW_API_KEY_ID",
];

const NCP_KEY_ID_WEB_KEYS = [
  "VITE_X_NCP_APIGW_API_KEY_ID",
  "X-NCP-APIGW-API-KEY-ID",
  "NCP_APIGW_API_KEY_ID",
  "X_NCP_APIGW_API_KEY_ID",
];

const NCP_SECRET_ENV_KEYS = [
  "X-NCP-APIGW-API-KEY",
  "NCP_APIGW_API_KEY",
  "X_NCP_APIGW_API_KEY",
];

const NCP_SECRET_WEB_KEYS = ["X-NCP-APIGW-API-KEY", "NCP_APIGW_API_KEY", "X_NCP_APIGW_API_KEY"];

function loadWebDotenvParsedNonProd() {
  if (process.env.NODE_ENV === "production") return null;
  const webEnvPath = path.resolve(__dirname, "../../../../web/.env");
  if (!fs.existsSync(webEnvPath)) return null;
  try {
    return dotenv.parse(fs.readFileSync(webEnvPath, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Geocoding / Directions 15 — API Gateway Key ID + Secret.
 * ① `apps/api/.env`(process.env)에 `X-NCP-APIGW-API-KEY-ID` + `X-NCP-APIGW-API-KEY` 둘 다 있으면 그것만 사용(웹 .env 미조회).
 * ② 비프로덕션: `apps/web/.env`에 ID+Secret 쌍이 있으면 로컬 편의용으로 사용.
 * ③ 그 외: API Secret + web의 Key ID 등 — 서로 다른 앱이면 NCP가 401을 반환할 수 있음.
 */
function resolveItineraryNcpCredentials() {
  const keyIdFromEnv = envFirst(...NCP_KEY_ID_ENV_KEYS);
  const keyFromEnv = envFirst(...NCP_SECRET_ENV_KEYS);
  if (keyIdFromEnv && keyFromEnv) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[itinerary] NCP: Key ID + Secret from API environment (X-NCP-APIGW-API-KEY-ID / X-NCP-APIGW-API-KEY)");
    }
    return { keyId: keyIdFromEnv, key: keyFromEnv };
  }

  const webParsed = loadWebDotenvParsedNonProd();
  if (webParsed) {
    const pairId = parsedFirst(webParsed, NCP_KEY_ID_WEB_KEYS);
    const pairSecret = parsedFirst(webParsed, NCP_SECRET_WEB_KEYS);
    if (pairId && pairSecret) {
      console.log("[itinerary] NCP: Key ID + Secret from apps/web/.env (dev, matched pair)");
      return { keyId: pairId, key: pairSecret };
    }
  }

  const keyIdFromWeb = webParsed ? parsedFirst(webParsed, NCP_KEY_ID_WEB_KEYS) : undefined;
  const keyId = keyIdFromEnv ?? keyIdFromWeb;
  const key = keyFromEnv;

  if (keyIdFromWeb && !keyIdFromEnv && key) {
    console.log("[itinerary] NCP Key ID: from apps/web/.env (dev fallback)");
    console.warn(
      "[itinerary] NCP: Secret은 API 환경변수에서 읽었습니다. HTTP_401이면 웹의 Key ID와 같은 애플리케이션의 Client Secret을 api .env에 넣거나, web .env에 ID+Secret 쌍을 두세요.",
    );
  } else if (keyIdFromWeb && !keyIdFromEnv && !key) {
    console.log("[itinerary] NCP Key ID: from apps/web/.env (dev fallback, Secret 없음 → MISSING_NCP_SECRET)");
  }

  return { keyId, key };
}

itineraryRouter.post("/route", async (req, res) => {
  const parsed = routeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_BODY" });
  }

  const { keyId, key } = resolveItineraryNcpCredentials();
  if (!keyId && !key) {
    return res.status(503).json({ ok: false, error: "MAPS_KEYS_NOT_CONFIGURED" });
  }
  if (!keyId) {
    return res.status(503).json({ ok: false, error: "MISSING_NCP_KEY_ID" });
  }
  if (!key) {
    return res.status(503).json({ ok: false, error: "MISSING_NCP_SECRET" });
  }
  const credentials = { keyId, key };

  const geminiApiKey = envFirst("GEMINI_API_KEY", "gemini_api_key");

  try {
    const route = await buildItineraryDrivingRoute(parsed.data, credentials, undefined, {
      geminiApiKey,
    });
    return res.json({
      ok: true,
      ...route,
    });
  } catch (err) {
    const msg = String(err?.message ?? "ROUTE_FAILED");
    const ncpStatus = err?.ncpHttpStatus;
    if (ncpStatus === 401 || ncpStatus === 403) {
      return res.status(400).json({ ok: false, error: "NCP_AUTH_FAILED" });
    }
    if (msg === "GEOCODE_NOT_FOUND") {
      const dbg = err?.geocodeDebug && typeof err.geocodeDebug === "object" ? err.geocodeDebug : {};
      return res.status(400).json({
        ok: false,
        error: "GEOCODE_NOT_FOUND",
        ...dbg,
      });
    }
    if (typeof err?.ncpRouteCode === "number") {
      return res.status(400).json({ ok: false, error: msg.slice(0, 200), code: err.ncpRouteCode });
    }
    console.error("[itinerary/route]", err);
    return res.status(502).json({ ok: false, error: "UPSTREAM_MAPS_ERROR" });
  }
});

itineraryRouter.post("/schedule-narrative", async (req, res) => {
  const parsed = scheduleNarrativeBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_BODY" });
  }

  const geminiApiKey = envFirst("GEMINI_API_KEY", "gemini_api_key");
  if (!geminiApiKey) {
    return res.status(503).json({ ok: false, error: "GEMINI_NOT_CONFIGURED" });
  }

  try {
    const text = await generateItineraryScheduleNarrative(parsed.data, geminiApiKey, undefined);
    return res.json({ ok: true, text });
  } catch (err) {
    const msg = String(err?.message ?? "GEMINI_FAILED");
    const st = /** @type {{ status?: number }} */ (err)?.status;
    if (st === 429) {
      return res.status(429).json({ ok: false, error: "GEMINI_QUOTA", message: msg });
    }
    if (st === 404) {
      return res.status(502).json({ ok: false, error: "GEMINI_MODEL_NOT_FOUND", message: msg });
    }
    console.error("[itinerary/schedule-narrative]", err);
    return res.status(502).json({ ok: false, error: "GEMINI_FAILED", message: msg.slice(0, 400) });
  }
});
