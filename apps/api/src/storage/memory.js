/**
 * 담당 유스케이스: UC1~UC8 전반(개발/테스트용 데이터 저장)
 * 역할: DB 연동 전까지 사용하는 인메모리 저장소(사용자/장소/협업세션 상태) 및 샘플 장소 데이터 시드
 */
import { nanoid } from "nanoid";

// 개발용 인메모리 저장소 (DB 연동 전까지)
export const users = new Map(); // id -> {id, username, passwordHash}
export const sessions = new Map(); // id -> session state
export const places = new Map(); // id -> place

// 샘플 데이터(지도 핀 테스트용)
const seed = [
  {
    id: "p_" + nanoid(6),
    kind: "tour",
    name: "샘플 관광지",
    summary: "요약 설명",
    description: "상세 설명",
    hours: "09:00-18:00",
    fee: "무료",
    imageUrl: null,
    lat: 34.8118,
    lng: 126.3922,
  },
  {
    id: "f_" + nanoid(6),
    kind: "festival",
    name: "샘플 축제",
    summary: "축제 요약",
    description: "축제 상세",
    startDate: "2026-06-01",
    endDate: "2026-06-07",
    imageUrl: null,
    lat: 34.8125,
    lng: 126.395,
  },
];

for (const p of seed) places.set(p.id, p);

