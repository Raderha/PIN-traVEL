/**
 * 담당 유스케이스: UC1(로그인), UC2(회원가입), UC3(로그아웃)
 * 역할: 인증/계정 관련 REST API 제공(회원가입, 로그인 토큰 발급, 로그아웃 처리)
 */
import { Router } from "express";
import { z } from "zod";

import { getMongoDb } from "../../storage/mongo.js";
import { signToken, requireAuth } from "../../security/auth.js";
import { hashPassword, verifyPassword } from "../../security/passwords.js";

export const authRouter = Router();

let ensured = false;
async function ensureIndexes() {
  if (ensured) return;
  ensured = true;
  const db = getMongoDb();
  await db.collection("users").createIndex({ username: 1 }, { unique: true, name: "users_username_unique" });
}

// UC2: 회원가입
authRouter.post("/signup", async (req, res) => {
  const body = z
    .object({
      username: z.string().min(3).max(30),
      password: z.string().min(8).max(128),
      email: z.string().email().max(254),
    })
    .safeParse(req.body);

  if (!body.success) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });

  try {
    await ensureIndexes();
    const db = getMongoDb();
    const col = db.collection("users");

    const { username, password, email } = body.data;
    const passwordScrypt = hashPassword(password);

    const now = new Date();
    const r = await col.insertOne({
      username,
      email,
      password: passwordScrypt,
      createdAt: now,
      updatedAt: now,
    });

    return res.json({ ok: true, user: { id: String(r.insertedId), username, email } });
  } catch (err) {
    // Mongo duplicate key error
    if (err && (err.code === 11000 || String(err.message ?? "").includes("E11000"))) {
      return res.status(409).json({ ok: false, error: "USERNAME_TAKEN" });
    }
    console.error("[auth] signup failed:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// UC1: 로그인
authRouter.post("/login", async (req, res) => {
  const body = z
    .object({
      username: z.string().min(1),
      password: z.string().min(1),
    })
    .safeParse(req.body);

  if (!body.success) return res.status(400).json({ ok: false, error: "INVALID_INPUT" });

  try {
    await ensureIndexes();
    const db = getMongoDb();
    const col = db.collection("users");

    const { username, password } = body.data;
    const user = await col.findOne({ username }, { projection: { username: 1, email: 1, password: 1 } });
    if (!user || !verifyPassword(password, user.password)) {
      return res
        .status(401)
        .json({ ok: false, error: "INVALID_CREDENTIALS", message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    const token = signToken({ userId: String(user._id), username: user.username });
    return res.json({ ok: true, token, user: { id: String(user._id), username: user.username, email: user.email ?? null } });
  } catch (err) {
    console.error("[auth] login failed:", err);
    return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
  }
});

// UC3: 로그아웃(토큰 기반이면 클라이언트에서 폐기; 여기서는 호환용 엔드포인트 제공)
authRouter.post("/logout", requireAuth, (req, res) => {
  return res.json({ ok: true });
});

