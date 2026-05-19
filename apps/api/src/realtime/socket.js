/**
 * 담당 유스케이스: UC7(동시 협업 여행 계획)
 * 역할: Socket.IO 기반 실시간 동기화(세션 참가, 커서 공유, 호스트 뷰 동기화, 장바구니/핀 선택 상태 브로드캐스트)
 */
import { Server } from "socket.io";
import { sessions } from "../storage/memory.js";
import { corsOriginCallback } from "../security/corsOrigins.js";

function isSessionHostSocket(socket, sessionId) {
  if (socket.data.isSessionHost) return true;
  const s = sessions.get(sessionId);
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
    socket.on("session:join", ({ sessionId, username, userId }) => {
      if (!sessionId) return;
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.username = username ?? "guest";
      socket.data.userId = userId ?? null;

      const s = sessions.get(sessionId);
      socket.data.isSessionHost = Boolean(s && userId && s.hostUserId === userId);

      socket.emit("session:state", { sessionId, state: s?.state ?? null });
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

      const s = sessions.get(sessionId);
      if (s) s.state.map = { center, zoom };
      socket.to(sessionId).emit("session:map", { center, zoom });
    });

    socket.on("session:cart", ({ placeIds }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const s = sessions.get(sessionId);
      if (s) s.state.cart = { placeIds: Array.isArray(placeIds) ? placeIds : [] };
      socket.to(sessionId).emit("session:cart", { placeIds });
    });

    socket.on("session:selectedPlace", ({ placeId }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const s = sessions.get(sessionId);
      if (s) s.state.selectedPlaceId = placeId ?? null;
      socket.to(sessionId).emit("session:selectedPlace", { placeId });
    });

    socket.on("disconnect", () => {
      const sessionId = socket.data.sessionId;
      if (sessionId) socket.to(sessionId).emit("session:member-left", { username: socket.data.username });
    });
  });
}
