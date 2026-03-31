/**
 * 담당 유스케이스: UC1(로그인), UC2(회원가입), UC3(로그아웃), UC4(지도 기반 조회), UC5(일정 생성), UC6(텍스트 파일 생성),
 *                UC7(동시 협업 세션), UC8(축제 달력)
 * 역할: Express 앱/HTTP 서버 부팅, 공통 미들웨어 설정, REST 라우트/Socket.IO 실시간 서버 연결
 */
import http from "http";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { registerRoutes } from "./routes/index.js";
import { attachSocketServer } from "./realtime/socket.js";
import { closeMongo, connectMongo } from "./storage/mongo.js";

dotenv.config();

async function main() {
  const { db } = await connectMongo();
  console.log(`[api] mongodb connected: ${db.databaseName}`);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    })
  );

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "pintravel-api" });
  });

  registerRoutes(app);

  const server = http.createServer(app);
  attachSocketServer(server);

  const shutdown = async (signal) => {
    console.log(`[api] shutdown (${signal})`);
    server.close(() => {});
    try {
      await closeMongo();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const port = Number(process.env.PORT ?? 4000);
  server.listen(port, () => {
    console.log(`[api] listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});

