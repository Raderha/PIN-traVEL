/**
 * 담당 유스케이스: UC7(동시 협업 여행 계획)
 * 역할: Socket.IO 기반 실시간 동기화(세션 참가, 커서 공유, 호스트 뷰 동기화, 장바구니/핀 선택 상태 브로드캐스트)
 */
import { Server } from "socket.io";
import {
  deleteCollabSession,
  getCollabSession,
  getCollabSessionCached,
  isCollabHostOnline,
  markCollabSessionDirty,
  registerCollabHostSocket,
  unregisterCollabHostSocket,
} from "../storage/collabSessions.js";
import { corsOriginCallback } from "../security/corsOrigins.js";

function isSessionHostSocket(socket, sessionId) {
  if (socket.data.isSessionHost) return true;
  const s = getCollabSessionCached(sessionId);
  const uid = socket.data.userId;
  return Boolean(s && uid && s.hostUserId === uid);
}

export function attachSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: corsOriginCallback,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.on("session:join", async ({ sessionId, username, userId }) => {
      if (!sessionId) return;

      const s = await getCollabSession(sessionId);
      if (!s) {
        socket.emit("session:error", { sessionId, error: "NOT_FOUND" });
        return;
      }

      const isHost = Boolean(userId && s.hostUserId === userId);

      if (isHost) {
        if (isCollabHostOnline(sessionId)) {
          socket.emit("session:error", { sessionId, error: "HOST_RECONNECT_NOT_ALLOWED" });
          return;
        }
        registerCollabHostSocket(sessionId, socket.id);
      }

      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.username = username ?? "guest";
      socket.data.userId = userId ?? null;
      socket.data.isSessionHost = isHost;

      socket.emit("session:state", { sessionId, state: s.state ?? null });
      socket.to(sessionId).emit("session:member-joined", { username: socket.data.username });
    });

    socket.on("session:cursor", ({ x, y }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      if (typeof x !== "number" || typeof y !== "number") return;
      socket.to(sessionId).emit("session:cursor", { username: socket.data.username, x, y });
    });

    socket.on("session:map", ({ center, zoom }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || !isSessionHostSocket(socket, sessionId)) return;
      if (!center || typeof center.lat !== "number" || typeof center.lng !== "number") return;
      if (typeof zoom !== "number") return;

      const s = getCollabSessionCached(sessionId);
      if (s) {
        s.state.map = { center, zoom };
        markCollabSessionDirty(sessionId);
      }
      socket.to(sessionId).emit("session:map", { center, zoom });
    });

    socket.on("session:itinerary", (payload) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId || !isSessionHostSocket(socket, sessionId)) return;

      const itinerary = payload ?? null;
      const s = getCollabSessionCached(sessionId);
      if (s) {
        s.state.itinerary = itinerary;
        markCollabSessionDirty(sessionId);
      }
      socket.to(sessionId).emit("session:itinerary", itinerary);
    });

    socket.on("session:cart", (payload) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      const cartDays = Array.isArray(payload?.cartDays) ? payload.cartDays : [[]];
      const tripHotelId =
        payload?.tripHotelId != null && typeof payload.tripHotelId === "string" ? payload.tripHotelId : null;
      const cart = { cartDays, tripHotelId };

      const s = getCollabSessionCached(sessionId);
      if (s) {
        s.state.cart = cart;
        markCollabSessionDirty(sessionId);
      }
      socket.to(sessionId).emit("session:cart", cart);
    });

    socket.on("session:selectedPlace", ({ placeId }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const s = getCollabSessionCached(sessionId);
      if (s) s.state.selectedPlaceId = placeId ?? null;
      socket.to(sessionId).emit("session:selectedPlace", { placeId });
    });

    socket.on("disconnect", async () => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;

      socket.to(sessionId).emit("session:member-left", { username: socket.data.username });

      if (socket.data.isSessionHost && unregisterCollabHostSocket(sessionId, socket.id)) {
        try {
          await deleteCollabSession(sessionId);
          io.in(sessionId).emit("session:ended", { sessionId, reason: "HOST_LEFT" });
        } catch (err) {
          console.error("[collab] delete session on host leave:", sessionId, err);
        }
      }
    });
  });
}
