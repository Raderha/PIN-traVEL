/**
 * Express 앱 팩토리 — HTTP 라우트만. Socket.IO는 `index.js`에서 listen 시에만 붙인다.
 * Lambda는 이 앱만 serverless-http로 감싼다.
 */
import express from "express";
import cors from "cors";

import { registerRoutes } from "./routes/index.js";
import { corsOriginCallback } from "./security/corsOrigins.js";

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    cors({
      origin: corsOriginCallback,
      credentials: true,
    }),
  );

  app.get("/health", (req, res) => {
    res.json({ ok: true, service: "pintravel-api" });
  });

  registerRoutes(app);
  return app;
}
