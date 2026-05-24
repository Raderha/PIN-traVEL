/**
 * 확정 일정을 MongoDB `schedule` 컬렉션에 저장
 * — 마이페이지 히스토리용: 날짜·일차별 방문지·지역·출발지·경로 요약(폴리라인·중복 필드 제외)
 */
import { Router } from "express";
import { z } from "zod";

import { getMongoDb } from "../../storage/mongo.js";
import { requireAuth } from "../../security/auth.js";
import { getCollabParticipantSnapshot } from "../../storage/collabSessions.js";

export const scheduleRouter = Router();

function devLog(event, payload) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[dev:${event}]`, payload);
}

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
  collabSessionId: z.string().min(1).max(120).nullable().optional(),
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

function scheduleHistoryItem(doc) {
  const visitDays = Array.isArray(doc.visitDays) ? doc.visitDays : [];
  const dates = visitDays.map((d) => d?.date).filter((d) => typeof d === "string" && d);
  const stops = visitDays.flatMap((d) => (Array.isArray(d?.stops) ? d.stops : []));
  const stopTitles = stops.map((s) => s?.title).filter((title) => typeof title === "string" && title.trim());

  return {
    id: String(doc._id),
    travelId: `#CM${String(doc._id).slice(-4).toUpperCase()}`,
    tripStartDate: doc.tripStartDate,
    tripEndDate: dates.length ? dates[dates.length - 1] : doc.tripStartDate,
    departure: doc.departure,
    mainStops: stopTitles.slice(0, 4),
    visitDays: visitDays.map((day, index) => ({
      dayIndex: Number.isInteger(day?.dayIndex) ? day.dayIndex : index,
      date: typeof day?.date === "string" ? day.date : "",
      stops: Array.isArray(day?.stops)
        ? day.stops
            .map((stop) => ({
              title: typeof stop?.title === "string" ? stop.title : "",
            }))
            .filter((stop) => stop.title.trim())
        : [],
    })),
    participantCount: Number(doc.participantCount) || 1,
    participantUserIds: Array.isArray(doc.participantUserIds) ? doc.participantUserIds : [doc.userId].filter(Boolean),
    createdAt: doc.createdAt,
  };
}

scheduleRouter.get("/my", requireAuth, async (req, res) => {
  try {
    const db = getMongoDb();
    const schedules = await db
      .collection("schedule")
      .find(
        { userId: req.user.userId },
        {
          projection: {
            userId: 1,
            tripStartDate: 1,
            departure: 1,
            visitDays: 1,
            participantCount: 1,
            participantUserIds: 1,
            createdAt: 1,
          },
        },
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    devLog("schedule.my.result", { ok: true, userId: req.user.userId, count: schedules.length });
    return res.json({ ok: true, schedules: schedules.map(scheduleHistoryItem) });
  } catch (err) {
    console.error("[schedule/my]", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

scheduleRouter.post("/confirm", requireAuth, async (req, res) => {
  const parsed = confirmBodySchema.safeParse(req.body);
  if (!parsed.success) {
    devLog("schedule.confirm", { ok: false, userId: req.user.userId, error: "INVALID_BODY", issues: parsed.error.issues.map((i) => i.path.join(".")) });
    return res.status(400).json({ ok: false, error: "INVALID_BODY" });
  }

  const now = new Date();
  const collabSessionId = parsed.data.collabSessionId ?? null;
  const participantSnapshot = collabSessionId ? getCollabParticipantSnapshot(collabSessionId) : null;
  const participants = participantSnapshot?.participants?.length
    ? participantSnapshot.participants
    : [{ userId: req.user.userId, username: req.user.username, isHost: true, joinedAt: now.getTime() }];

  const doc = {
    userId: req.user.userId,
    username: req.user.username,
    collabSessionId,
    participantCount: participantSnapshot?.count ?? 1,
    participantUserIds: participantSnapshot?.userIds?.length ? participantSnapshot.userIds : [req.user.userId],
    participants,
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
  devLog("schedule.confirm.request", {
    userId: req.user.userId,
    username: req.user.username,
    collabSessionId,
    participantCount: doc.participantCount,
    tripStartDate: doc.tripStartDate,
    departure: doc.departure,
    tripHotelId: doc.tripHotelId,
    visitDayCount: doc.visitDays.length,
    stopsByDay: doc.visitDays.map((day) => ({
      dayIndex: day.dayIndex,
      date: day.date,
      stopCount: day.stops.length,
      titles: day.stops.map((s) => s.title),
    })),
    totals: doc.totals,
    legCount: doc.legs.length,
  });

  try {
    const db = getMongoDb();
    const r = await db.collection("schedule").insertOne(doc);
    devLog("schedule.confirm.result", { ok: true, scheduleId: String(r.insertedId), userId: req.user.userId });
    return res.json({ ok: true, scheduleId: String(r.insertedId) });
  } catch (err) {
    console.error("[schedule/confirm]", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});
