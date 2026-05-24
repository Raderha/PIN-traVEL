/**
 * 담당 유스케이스: UC7(동시 협업을 위한 세션 생성/공유)
 * 역할: 협업 세션 생성 및 세션 상태 조회 API 제공(초대 URL 발급용 sessionId 생성 포함)
 */
import { Router } from "express";
import { nanoid } from "nanoid";

import { requireAuth } from "../../security/auth.js";
import { createCollabSession, getCollabSession } from "../../storage/collabSessions.js";

export const sessionsRouter = Router();

function devLog(event, payload) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[dev:${event}]`, payload);
}

// UC7: 세션 생성 및 URL 발급
sessionsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const id = nanoid(10);
    await createCollabSession({ id, hostUserId: req.user.userId });
    devLog("sessions.create.result", { ok: true, sessionId: id, hostUserId: req.user.userId, username: req.user.username });
    return res.json({ ok: true, sessionId: id });
  } catch (err) {
    console.error("[sessions/create]", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// 세션 상태 조회(재접속/동기화용)
sessionsRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const s = await getCollabSession(req.params.id);
    if (!s) {
      devLog("sessions.get.result", { ok: false, sessionId: req.params.id, userId: req.user.userId, error: "NOT_FOUND" });
      return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    }
    devLog("sessions.get.result", {
      ok: true,
      sessionId: req.params.id,
      userId: req.user.userId,
      hostUserId: s.hostUserId,
      hasCart: Boolean(s.state?.cart),
      hasItinerary: Boolean(s.state?.itinerary),
    });
    return res.json({ ok: true, session: s });
  } catch (err) {
    console.error("[sessions/get]", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

