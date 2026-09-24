/**
 * 담당 유스케이스: UC1(로그인), UC2(회원가입), UC3(로그아웃), UC4(지도 기반 조회), UC5(일정 생성), UC6(텍스트 파일 생성),
 *                UC7(동시 협업 세션), UC8(축제 달력)
 * 역할: 로컬/상시 프로세스 HTTP 서버 부팅, REST + Socket.IO
 */
import http from "http";

import { createApp } from "./app.js";
import { loadLocalEnv } from "./config/loadLocalEnv.js";
import { attachSocketServer } from "./realtime/socket.js";
import {
  ensureCollabSessionsIndexes,
  flushAllCachedCollabSessions,
  startCollabSessionPersistence,
  stopCollabSessionPersistence,
} from "./storage/collabSessions.js";
import { closeMongo, connectMongo } from "./storage/mongo.js";

const { pkgEnvPath, found } = loadLocalEnv();

if (process.env.NODE_ENV !== "production") {
  console.log(
    `[api] dotenv: package=${pkgEnvPath} (${found ? "found" : "missing"}) cwd=${process.cwd()}`,
  );
}

async function main() {
  const { db } = await connectMongo();
  console.log(`[api] mongodb connected: ${db.databaseName}`);

  await ensureCollabSessionsIndexes();
  startCollabSessionPersistence();

  const app = createApp();
  const server = http.createServer(app);
  attachSocketServer(server);

  const shutdown = async (signal) => {
    console.log(`[api] shutdown (${signal})`);
    server.close(() => {});
    try {
      stopCollabSessionPersistence();
      await flushAllCachedCollabSessions();
      await closeMongo();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const port = Number(process.env.PORT ?? 4000);
  const host = process.env.HOST ?? "0.0.0.0";
  server.listen(port, host, () => {
    console.log(`[api] listening on http://${host}:${port} (LAN: http://<이-PC-IP>:${port})`);
  });
}

main().catch((err) => {
  console.error("[api] failed to start:", err);
  process.exit(1);
});
