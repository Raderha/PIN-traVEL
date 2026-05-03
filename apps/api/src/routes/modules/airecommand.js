/**
 * 역할: 선택한 장소 주변의 식당/숙소 추천 API 제공
 *
 * 마운트 경로: /api/airecommand
 * 데이터 소스: syncBusanHotelFood.js가 생성한 food, hotel 컬렉션
 */
import { Router } from "express";
import { z } from "zod";

import { getMongoDb } from "../../storage/mongo.js";

export const airecommandRouter = Router();

const nearbyQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  limit: z.coerce.number().int().min(1).max(10).optional(),
});

function collection(name) {
  return getMongoDb().collection(name);
}

function compactText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length ? text : null;
}

function pointFromLocation(location) {
  const coordinates = location?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lat, lng };
}

function recommendationItem(doc) {
  return {
    contentId: doc.contentId,
    title: compactText(doc.title) ?? "이름 없음",
    address: doc.address ?? null,
    image: compactText(doc.image) ?? doc.images?.firstimage ?? doc.images?.firstimage2 ?? null,
    tel: compactText(doc.tel),
    category: doc.category ?? null,
    location: pointFromLocation(doc.location),
    distanceMeters: Math.round(Number(doc.distanceMeters ?? 0)),
  };
}

async function findNearby({ collectionName, lat, lng, limit }) {
  const near = { type: "Point", coordinates: [lng, lat] };

  for (const radiusKm of [1, 2, 3]) {
    const rows = await collection(collectionName)
      .aggregate([
        {
          $geoNear: {
            near,
            distanceField: "distanceMeters",
            maxDistance: radiusKm * 1000,
            spherical: true,
            query: { "location.coordinates": { $exists: true } },
          },
        },
        { $limit: limit },
        {
          $project: {
            _id: 0,
            contentId: 1,
            title: 1,
            address: 1,
            image: 1,
            images: 1,
            tel: 1,
            category: 1,
            location: 1,
            distanceMeters: 1,
          },
        },
      ])
      .toArray();

    if (rows.length >= limit || radiusKm === 3) {
      return { radiusKm, items: rows.map(recommendationItem) };
    }
  }

  return { radiusKm: 3, items: [] };
}

airecommandRouter.get("/nearby", async (req, res) => {
  const parsed = nearbyQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { lat, lng } = parsed.data;
  const limit = parsed.data.limit ?? 3;

  try {
    const [food, hotel] = await Promise.all([
      findNearby({ collectionName: "food", lat, lng, limit }),
      findNearby({ collectionName: "hotel", lat, lng, limit }),
    ]);

    return res.json({
      ok: true,
      origin: { lat, lng },
      limit,
      search: {
        defaultRadiusKm: 1,
        maxRadiusKm: 3,
        stepKm: 1,
      },
      food,
      hotel,
    });
  } catch (err) {
    console.error("[airecommand] nearby failed:", err);
    return res.status(500).json({ ok: false, error: "NEARBY_RECOMMENDATION_FAILED" });
  }
});
