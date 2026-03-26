/**
 * 담당 유스케이스: UC1(로그인), UC2(회원가입), UC3(로그아웃)
 * 역할: 인증/계정 관련 REST API 제공(회원가입, 로그인 토큰 발급, 로그아웃 처리)
 */
import { Router } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";

import { users } from "../../storage/memory.js";
import { signToken, requireAuth } from "../../security/auth.js";

export const authRouter = Router();

// UC2: 회원가입
authRouter.post("/signup", (req, res) => {
  const body = z
    .object({
      username: z.string().min(3).max(30),
      password: z.string().min(8).max(128),
    })
    .safeParse(req.body);

  if (!body.success) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });

  const { username, password } = body.data;
  const exists = [...users.values()].some((u) => u.username === username);
  if (exists) return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });

  const id = nanoid();
  users.set(id, { id, username, passwordHash: password });

  return res.json({ ok: true, user: { id, username } });
});

// UC1: 로그인
authRouter.post("/login", (req, res) => {
  const body = z
    .object({
      username: z.string().min(1),
      password: z.string().min(1),
    })
    .safeParse(req.body);

  if (!body.success) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });

  const { username, password } = body.data;
  const user = [...users.values()].find((u) => u.username === username);
  if (!user || user.passwordHash !== password) {
    return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS", message: "아이디 또는 비밀번호가 올바르지 않습니다." });
  }

  const token = signToken({ userId: user.id, username: user.username });
  return res.json({ ok: true, token, user: { id: user.id, username: user.username } });
});

// UC3: 로그아웃(토큰 기반이면 클라이언트에서 폐기; 여기서는 호환용 엔드포인트 제공)
authRouter.post("/logout", requireAuth, (req, res) => {
  return res.json({ ok: true });
});

