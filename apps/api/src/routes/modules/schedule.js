/**
 * 확정 일정을 MongoDB `schedule` 컬렉션에 저장
 * — 마이페이지 히스토리용: 날짜·일차별 방문지·지역·출발지·경로 요약(폴리라인·중복 필드 제외)
 */
import { Router } from "express";
import { z } from "zod";

import { getMongoDb } from "../../storage/mongo.js";
import { requireAuth } from "../../security/auth.js";

export const scheduleRouter = Router();

const visitPinSchema = z.object({
  id: z.string().max(240),
  title: z.string().max(400),
  kind: z.string().max(32).optional(),
  contentId: z.string().max(80).optional(),
  contentTypeId: z.string().max(16).nullable().optional(),
  location: z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
  }),
});

const visitDaySchema = z.object({
  dayIndex: z.number().int().min(0).max(99),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  stops: z.array(visitPinSchema).max(40),
});

const legCompactSchema = z.object({
  toTitle: z.string().max(400),
  distanceM: z.number().finite(),
  durationMs: z.number().finite(),
});

const confirmBodySchema = z.object({
  region: z.string().min(1).max(64).optional(),
  tripStartDate: z.string().min(1).max(64),
  departure: z.string().min(1).max(300),
  tripHotelId: z.string().max(240).nullable().optional(),
  visitDays: z.array(visitDaySchema).min(1).max(21),
  departureGeo: z.object({
    lat: z.number().finite(),
    lng: z.number().finite(),
  }),
  departureRoad: z.string().max(500).nullable().optional(),
  totals: z.object({
    distanceM: z.number().finite(),
    durationMs: z.number().finite(),
  }),
  legs: z.array(legCompactSchema).max(60),
});

scheduleRouter.post("/confirm", requireAuth, async (req, res) => {
  const parsed = confirmBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: "INVALID_BODY" });
  }

  const now = new Date();
  const doc = {
    userId: req.user.userId,
    username: req.user.username,
    region: parsed.data.region ?? "busan",
    tripStartDate: parsed.data.tripStartDate,
    departure: parsed.data.departure,
    tripHotelId: parsed.data.tripHotelId ?? null,
    visitDays: parsed.data.visitDays,
    departureGeo: parsed.data.departureGeo,
    departureRoad: parsed.data.departureRoad ?? null,
    totals: parsed.data.totals,
    legs: parsed.data.legs,
    createdAt: now,
    updatedAt: now,
  };

  try {
    const db = getMongoDb();
    const r = await db.collection("schedule").insertOne(doc);
    return res.json({ ok: true, scheduleId: String(r.insertedId) });
  } catch (err) {
    console.error("[schedule/confirm]", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});
