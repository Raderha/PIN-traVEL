/**
 * 담당 유스케이스: UC4(맵 기반 탐색 및 장소 조회)
 * 역할: 지도 영역(경계 좌표) 기반 관광지/축제 목록 조회, 핀/상세패널에 필요한 장소 정보 제공
 *
 * ── 후속 개발 시 참고 ──
 * - 마운트 경로: `registerRoutes`에서 `/api/map` (routes/index.js).
 * - 데이터 소스: 영속화 전에는 `storage/memory.js`의 `places` Map을 사용하면 됨.
 *   `kind`가 `tour` | `festival` 등으로 구분되며, 축제는 `startDate`/`endDate`가 있음.
 * - 전형적인 엔드포인트 후보:
 *   - 뷰포트(남서·북동 lat/lng) 또는 zoom+center로 bbox 계산 후, 그 안에 있는 장소 목록 반환.
 *   - 단일 장소 상세: `placeId`로 조회(지도 핀 클릭 → 패널).
 * - UC8 달력에서 축제 선택 후 지도 탭으로 올 때: 클라이언트가 `id`와 `lat`/`lng`로 카메라 이동.
 *   지도 화면 자체의 “기간 필터”(요구사항 UC4-REQ-6 등)는 이 라우터의 쿼리 파라미터로 흡수하는 편이 자연스러움.
 * - 인증: 공개 조회만이면 미들웨어 없이, 사용자별 저장 핀이 생기면 `security/auth.js`의 `requireAuth` 패턴을 sessions 라우터 참고.
 */
import { Router } from "express";
import { z } from "zod";

import { getMongoDb } from "../../storage/mongo.js";

export const mapRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

function collection(name) {
  return getMongoDb().collection(name);
}

function regionQueryForRegion(region) {
  if (region === "busan") {
    return {
      $or: [{ "idong.regnCd": "26" }, { idongCode: /^26/ }],
      "location.coordinates": { $exists: true },
    };
  }
  return null;
}

function pointFromLocation(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

function festivalSummaryPin(f) {
  const point = pointFromLocation(f.location);
  if (!point) return null;

  return {
    id: `festival:${f.contentId}`,
    contentId: f.contentId,
    kind: "festival",
    iconType: "festival",
    title: f.title,
    subtitle: f.eventPlace ?? f.address?.addr1 ?? null,
    address: f.address ?? null,
    image: f.image ?? null,
    summary: {
      fee: f.fee ?? null,
      time: f.useTime ?? null,
      startDate: f.startDate ?? null,
      endDate: f.endDate ?? null,
    },
    location: point,
  };
}

function placeIconType(place) {
  const cat3 = place.category?.cat3;
  if (cat3 === "A02010100" || cat3 === "A02010200") return "palace";
  return "natural";
}

function placeSummaryPin(place) {
  const point = pointFromLocation(place.location);
  if (!point) return null;

  return {
    id: `tour:${place.contentId}`,
    contentId: place.contentId,
    kind: "tour",
    iconType: placeIconType(place),
    title: place.title,
    subtitle: place.address?.addr1 ?? null,
    address: place.address ?? null,
    image: place.image ?? null,
    summary: {
      fee: place.fee ?? null,
      time: place.useTime ?? null,
      restDate: place.restDate ?? null,
    },
    location: point,
  };
}

// UC4: 지도용 정보 요약형 핀 데이터. 프론트는 이 응답을 핀 템플릿/아이콘 assets와 결합해 지도에 렌더링한다.
mapRouter.get("/summary-pins", async (req, res) => {
  const parsed = z
    .object({
      kind: z.enum(["all", "festival", "tour"]).optional(),
      region: z.enum(["busan"]).optional(),
      date: isoDate.optional(),
      from: isoDate.optional(),
      to: isoDate.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const kind = parsed.data.kind ?? "all";
  const region = parsed.data.region ?? "busan";
  const date = parsed.data.date ?? null;
  const rangeFrom = parsed.data.from ?? null;
  const rangeTo = parsed.data.to ?? null;
  const limit = parsed.data.limit ?? 40;
  const regionQuery = regionQueryForRegion(region);
  if (!regionQuery) return res.status(400).json({ ok: false, error: "UNSUPPORTED_REGION" });

  const pins = [];

  if (kind === "all" || kind === "festival") {
    const festivalLimit = kind === "all" ? Math.ceil(limit / 2) : limit;
    const dateQuery = date
      ? { startDate: { $lte: date }, endDate: { $gte: date } }
      : rangeFrom && rangeTo
        ? { startDate: { $lte: rangeTo }, endDate: { $gte: rangeFrom } }
        : {};
    const festivalQuery = {
      ...regionQuery,
      ...dateQuery,
    };

    const festivals = await collection("festivals")
      .find(
        festivalQuery,
        {
          projection: {
            _id: 0,
            contentId: 1,
            title: 1,
            startDate: 1,
            endDate: 1,
            address: 1,
            location: 1,
            image: 1,
            eventPlace: 1,
            useTime: 1,
            fee: 1,
          },
        }
      )
      .sort({ endDate: 1, startDate: 1, title: 1 })
      .limit(festivalLimit)
      .toArray();
    pins.push(...festivals.map(festivalSummaryPin).filter(Boolean));
  }

  if (kind === "all" || kind === "tour") {
    const remaining = Math.max(limit - pins.length, 0);
    if (remaining > 0) {
      const places = await collection("places")
        .find(
          regionQuery,
          {
            projection: {
              _id: 0,
              contentId: 1,
              title: 1,
              category: 1,
              address: 1,
              location: 1,
              image: 1,
              useTime: 1,
              restDate: 1,
              fee: 1,
            },
          }
        )
        .sort({ title: 1 })
        .limit(remaining)
        .toArray();
      pins.push(...places.map(placeSummaryPin).filter(Boolean));
    }
  }

  return res.json({ ok: true, region, date, from: rangeFrom, to: rangeTo, pins });
});
