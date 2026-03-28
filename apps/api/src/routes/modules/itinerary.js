/**
 * 담당 유스케이스: UC5(여행 일정 생성), UC6(여행 일정 텍스트 파일 생성)
 * 역할: 일정 생성/저장/보내기(텍스트 구성, 파일명 생성) 관련 API 제공
 *
 * ── 후속 개발 시 참고 ──
 * - 마운트 경로: `registerRoutes`에서 `/api/itinerary` (routes/index.js).
 * - UC6 텍스트/파일명 로직은 이미 `services/itineraryText.js`에 있음:
 *   `buildItineraryText`, `makeItineraryFilename` — 다운로드 API에서 그대로 호출하면 됨.
 * - 저장소: 현재 일정 전용 Map은 memory.js에 없을 수 있음. DB 연동 전에는 `sessions`처럼
 *   `itineraries` Map을 memory.js에 두거나, 사용자별로 `users` 확장 필드에 넣는 방식 중 선택.
 * - 전형적인 엔드포인트 후보:
 *   - POST 일정 생성(본문: 출발지, 시작일, 이동수단, stops[] 등 — buildItineraryText 입력 형식과 맞출 것).
 *   - GET/PATCH/DELETE 특정 일정 id (로그인 사용자 본인 것만 — `requireAuth` + userId 검사).
 *   - GET 일정 텍스트 다운로드: `Content-Disposition`으로 .txt 응답, 위 유틸 사용.
 * - 인증: `routes/modules/sessions.js`처럼 `requireAuth`를 붙이는 것을 권장(타 사용자 일정 노출 방지).
 */
import { Router } from "express";

export const itineraryRouter = Router();
