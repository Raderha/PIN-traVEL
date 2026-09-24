/**
 * API Gateway HTTP API (payload 2.0) → Express.
 * Socket.IO는 붙이지 않는다 (1차 배포 범위 밖).
 */
import serverless from "serverless-http";

import { createApp } from "./app.js";
import { loadSsmIntoEnv } from "./config/loadSsm.js";
import { ensureCollabSessionsIndexes } from "./storage/collabSessions.js";
import { connectMongo } from "./storage/mongo.js";

let handlerPromise;

async function init() {
  await loadSsmIntoEnv();
  const { db } = await connectMongo();
  console.log(`[lambda] mongodb connected: ${db.databaseName}`);
  await ensureCollabSessionsIndexes();
  const app = createApp();
  return serverless(app);
}

export async function handler(event, context) {
  context.callbackWaitsForEmptyEventLoop = false;
  if (!handlerPromise) handlerPromise = init();
  const h = await handlerPromise;
  return h(event, context);
}
