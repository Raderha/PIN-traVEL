/**
 * 담당 유스케이스: UC1~UC8 (각 기능 라우트 집합)
 * 역할: 기능별 라우터를 Express 앱에 마운트하는 라우팅 엔트리
 */
import { authRouter } from "./modules/auth.js";
import { airecommandRouter } from "./modules/airecommand.js";
import { mapRouter } from "./modules/map.js";
import { festivalsRouter } from "./modules/festivals.js";
import { itineraryRouter } from "./modules/itinerary.js";
import { sessionsRouter } from "./modules/sessions.js";

export function registerRoutes(app) {
  app.use("/api/auth", authRouter);
  app.use("/api/airecommand", airecommandRouter);
  app.use("/api/map", mapRouter);
  app.use("/api/festivals", festivalsRouter);
  app.use("/api/itinerary", itineraryRouter);
  app.use("/api/sessions", sessionsRouter);
}

