/**
 * 담당 유스케이스: UC7(동시 협업 여행 계획)
 * 역할: Socket.IO 기반 실시간 동기화(세션 참가, 커서 공유, 호스트 뷰 동기화, 장바구니/핀 선택 상태 브로드캐스트)
 */
import { Server } from "socket.io";
import { sessions } from "../storage/memory.js";

export function attachSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // 세션 참여
    socket.on("session:join", ({ sessionId, username }) => {
      if (!sessionId) return;
      socket.join(sessionId);
      socket.data.sessionId = sessionId;
      socket.data.username = username ?? "guest";

      const s = sessions.get(sessionId);
      socket.emit("session:state", { sessionId, state: s?.state ?? null });
      socket.to(sessionId).emit("session:member-joined", { username: socket.data.username });
    });

    // 마우스 공유 (UC7-REQ-2)
    socket.on("session:cursor", ({ x, y }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      socket.to(sessionId).emit("session:cursor", { username: socket.data.username, x, y });
    });

    // 호스트 시점 동기화 (UC7-REQ-3)
    socket.on("session:map", ({ center, zoom }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const s = sessions.get(sessionId);
      if (s) s.state.map = { center, zoom };
      socket.to(sessionId).emit("session:map", { center, zoom });
    });

    // 장바구니 동기화 (UC7-REQ-4)
    socket.on("session:cart", ({ placeIds }) => {
      const sessionId = socket.data.sessionId;
      if (!sessionId) return;
      const s = sessions.get(sessionId);
      if (s) s.state.cart = { placeIds: Array.isArray(placeIds) ? placeIds : [] };
      socket.to(sessionId).emit("session:cart", { placeIds });
    });

    // 핀 선택 동기화 
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