/**
 * 담당 유스케이스: UC1(로그인), UC3(로그아웃), UC7(세션 생성/조회 등 인증 필요 API)
 * 역할: (MVP) 토큰 생성/검증 및 Express 인증 미들웨어 제공(향후 JWT/세션 방식으로 교체 가능)
 */
import { z } from "zod";

export function signToken(payload) {
  // MVP: 실제 JWT로 바꾸기 전 임시 토큰(테스트/개발용)
  const raw = JSON.stringify({ ...payload, iat: Date.now() });
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function verifyToken(token) {
  try {
    const raw = Buffer.from(token, "base64url").toString("utf8");
    const parsed = z
      .object({
        userId: z.string(),
        username: z.string(),
        iat: z.number(),
      })
      .parse(JSON.parse(raw));
    return parsed;
  } catch {
    return null;
  }
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
  if (!token) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ ok: false, error: "UNAUTHORIZED" });
  req.user = user;
  next();
}

