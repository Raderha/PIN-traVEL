/**
 * 담당 유스케이스: UC7(동시 협업을 위한 세션 생성/공유)
 * 역할: 협업 세션 생성 및 세션 상태 조회 API 제공(초대 URL 발급용 sessionId 생성 포함)
 */
import { Router } from "express";
import { nanoid } from "nanoid";

import { requireAuth } from "../../security/auth.js";
import { createCollabSession, getCollabSession } from "../../storage/collabSessions.js";

export const sessionsRouter = Router();

// UC7: 세션 생성 및 URL 발급
sessionsRouter.post("/", requireAuth, async (req, res) => {
  try {
    const id = nanoid(10);
    await createCollabSession({ id, hostUserId: req.user.userId });
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
    if (!s) return res.status(404).json({ ok: false, error: "NOT_FOUND" });
    return res.json({ ok: true, session: s });
  } catch (err) {
    console.error("[sessions/get]", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});
