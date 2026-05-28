/**
 * 협업 세션(UC7) — MongoDB `collab_sessions` 컬렉션 + 인메모리 캐시
 * 커서 등 실시간 전용 데이터는 저장하지 않음. map/cart/itinerary·호스트 정보만 주기적으로 flush.
 */
import { getMongoDb } from "./mongo.js";
import { sessions } from "./memory.js";

export const COLLAB_SESSIONS_COLLECTION = "collab_sessions";

function devLog(event, payload) {
  if (process.env.NODE_ENV === "production") return;
  console.log(`[dev:${event}]`, payload);
}

const dirtyIds = new Set();
/** sessionId → host socket.id (재접속은 게스트만, 호스트 중복 접속 차단) */
const activeHostSocketIds = new Map();
/** sessionId → socket.id → participant */
const activeParticipants = new Map();
let flushTimer = null;

const FLUSH_INTERVAL_MS = Number(process.env.COLLAB_SESSION_FLUSH_MS ?? 5000);

export function defaultCollabSessionState() {
  return {
    map: { center: null, zoom: null },
    cart: { cartDays: [[]], tripHotelId: null },
    itinerary: null,
    /** 실시간 전용(재접속 동기화 제외) */
    selectedPlaceId: null,
  };
}

/** DB에 저장할 state (커서·selectedPlace 제외) */
export function collabStateForPersist(state) {
  const s = state ?? {};
  return {
    map: s.map ?? { center: null, zoom: null },
    cart: s.cart ?? { cartDays: [[]], tripHotelId: null },
    itinerary: s.itinerary ?? null,
  };
}

function sessionFromDbDoc(doc) {
  if (!doc) return null;
  const persisted = collabStateForPersist(doc.state);
  return {
    id: doc.id,
    hostUserId: doc.hostUserId,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.getTime() : Number(doc.createdAt) || Date.now(),
    state: {
      ...defaultCollabSessionState(),
      ...persisted,
      selectedPlaceId: null,
    },
  };
}

export async function ensureCollabSessionsIndexes() {
  const col = getMongoDb().collection(COLLAB_SESSIONS_COLLECTION);
  await col.createIndex({ id: 1 }, { unique: true, name: "uniq_session_id" });
  await col.createIndex({ updatedAt: 1 }, { name: "idx_updated_at" });
}

export async function createCollabSession({ id, hostUserId }) {
  const createdAt = new Date();
  const doc = {
    id,
    hostUserId,
    createdAt,
    updatedAt: createdAt,
    state: collabStateForPersist(defaultCollabSessionState()),
  };

  await getMongoDb().collection(COLLAB_SESSIONS_COLLECTION).insertOne(doc);

  const session = sessionFromDbDoc(doc);
  sessions.set(id, session);
  devLog("collab_sessions.create.result", { ok: true, sessionId: id, hostUserId });
  return session;
}

export async function getCollabSession(id) {
  const cached = sessions.get(id);
  if (cached) return cached;

  const doc = await getMongoDb().collection(COLLAB_SESSIONS_COLLECTION).findOne({ id });
  if (!doc) return null;

  const session = sessionFromDbDoc(doc);
  sessions.set(id, session);
  devLog("collab_sessions.get.cache_miss", { ok: true, sessionId: id, hostUserId: session.hostUserId });
  return session;
}

export function getCollabSessionCached(id) {
  return sessions.get(id) ?? null;
}

export function markCollabSessionDirty(id) {
  if (sessions.has(id)) dirtyIds.add(id);
}

export function isCollabHostOnline(sessionId) {
  return activeHostSocketIds.has(sessionId);
}

export function registerCollabHostSocket(sessionId, socketId) {
  activeHostSocketIds.set(sessionId, socketId);
}

export function registerCollabParticipant(sessionId, socketId, participant) {
  if (!activeParticipants.has(sessionId)) activeParticipants.set(sessionId, new Map());
  activeParticipants.get(sessionId).set(socketId, {
    socketId,
    userId: participant?.userId ?? null,
    username: participant?.username ?? "guest",
    isHost: Boolean(participant?.isHost),
    joinedAt: Date.now(),
  });
}

export function unregisterCollabParticipant(sessionId, socketId) {
  const participants = activeParticipants.get(sessionId);
  if (!participants) return;
  participants.delete(socketId);
  if (participants.size === 0) activeParticipants.delete(sessionId);
}

export function getCollabParticipantSnapshot(sessionId) {
  const participants = activeParticipants.get(sessionId);
  if (!participants) return null;

  const byUser = new Map();
  for (const participant of participants.values()) {
    const key = participant.userId ? `user:${participant.userId}` : `socket:${participant.socketId}`;
    const existing = byUser.get(key);
    if (!existing || participant.isHost) {
      byUser.set(key, {
        userId: participant.userId,
        username: participant.username,
        isHost: participant.isHost,
        joinedAt: participant.joinedAt,
      });
    }
  }

  const list = [...byUser.values()];
  return {
    count: list.length,
    userIds: list.map((p) => p.userId).filter(Boolean),
    participants: list,
  };
}

/** @returns {boolean} 이 소켓이 활성 호스트였는지 */
export function unregisterCollabHostSocket(sessionId, socketId) {
  if (activeHostSocketIds.get(sessionId) !== socketId) return false;
  activeHostSocketIds.delete(sessionId);
  return true;
}

export async function deleteCollabSession(id) {
  sessions.delete(id);
  dirtyIds.delete(id);
  activeHostSocketIds.delete(id);
  activeParticipants.delete(id);

  const r = await getMongoDb().collection(COLLAB_SESSIONS_COLLECTION).deleteOne({ id });
  devLog("collab_sessions.delete.result", { ok: true, sessionId: id, deletedCount: r.deletedCount ?? 0 });
}

async function flushOneSession(id) {
  const s = sessions.get(id);
  if (!s) return;

  await getMongoDb().collection(COLLAB_SESSIONS_COLLECTION).updateOne(
    { id },
    {
      $set: {
        hostUserId: s.hostUserId,
        updatedAt: new Date(),
        state: collabStateForPersist(s.state),
      },
    },
  );
}

export async function flushDirtyCollabSessions() {
  if (dirtyIds.size === 0) return;

  const ids = [...dirtyIds];
  dirtyIds.clear();

  devLog("collab_sessions.flush_dirty.start", { count: ids.length, ids: ids.slice(0, 10) });

  for (const id of ids) {
    try {
      await flushOneSession(id);
    } catch (err) {
      console.error("[collab_sessions] flush failed:", id, err);
      dirtyIds.add(id);
    }
  }

  devLog("collab_sessions.flush_dirty.done", { ok: true, flushed: ids.length, remainingDirty: dirtyIds.size });
}

export async function flushAllCachedCollabSessions() {
  const ids = [...sessions.keys()];
  for (const id of ids) {
    try {
      await flushOneSession(id);
    } catch (err) {
      console.error("[collab_sessions] flush all failed:", id, err);
    }
  }
  dirtyIds.clear();
}

export function startCollabSessionPersistence() {
  if (flushTimer) return;

  flushTimer = setInterval(() => {
    flushDirtyCollabSessions().catch((err) => {
      console.error("[collab_sessions] periodic flush error:", err);
    });
  }, FLUSH_INTERVAL_MS);

  if (typeof flushTimer.unref === "function") flushTimer.unref();
  console.log(`[collab_sessions] periodic flush every ${FLUSH_INTERVAL_MS}ms`);
}

export function stopCollabSessionPersistence() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}
