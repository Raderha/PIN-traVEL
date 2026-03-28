/**
 * 담당 유스케이스: UC4(맵 기반 탐색 및 장소 조회)
 * 역할: 지도 영역(경계 좌표) 기반 관광지/축제 목록 조회, 핀/상세패널에 필요한 장소 정보 제공
 *
 * ── 후속 개발 시 참고 ──
 * - 마운트 경로: `registerRoutes`에서 `/api/map` (routes/index.js).
 * - 데이터 소스: 영속화 전에는 `storage/memory.js`의 `places` Map을 사용하면 됨.
 *   `kind`가 `tour` | `festival` 등으로 구분되며, 축제는 `startDate`/`endDate`가 있음.
 * - 전형적인 엔드포인트 후보:
 *   - 뷰포트(남서·북동 lat/lng) 또는 zoom+center로 bbox 계산 후, 그 안에 있는 장소 목록 반환.
 *   - 단일 장소 상세: `placeId`로 조회(지도 핀 클릭 → 패널).
 * - UC8 달력에서 축제 선택 후 지도 탭으로 올 때: 클라이언트가 `id`와 `lat`/`lng`로 카메라 이동.
 *   지도 화면 자체의 “기간 필터”(요구사항 UC4-REQ-6 등)는 이 라우터의 쿼리 파라미터로 흡수하는 편이 자연스러움.
 * - 인증: 공개 조회만이면 미들웨어 없이, 사용자별 저장 핀이 생기면 `security/auth.js`의 `requireAuth` 패턴을 sessions 라우터 참고.
 */
import { Router } from "express";

export const mapRouter = Router();
