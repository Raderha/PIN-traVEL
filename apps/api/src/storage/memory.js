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
    location: "전라남도 목포시",
    imageUrl: null,
    lat: 34.8125,
    lng: 126.395,
  },
  // 달력/지도 연동 데모(UC8)
  {
    id: "f_uc8_hongseong",
    kind: "festival",
    name: "홍성남당항 새조개축제",
    summary: "남당항 일대 새조개·해산물 축제",
    description: "충남 홍성 남당항에서 열리는 지역 축제입니다.",
    startDate: "2026-01-17",
    endDate: "2026-04-30",
    location: "충청남도 홍성군",
    imageUrl: "https://picsum.photos/seed/hongseong/320/200",
    lat: 36.601,
    lng: 126.665,
  },
  {
    id: "f_uc8_gurye",
    kind: "festival",
    name: "구례산수유꽃축제",
    summary: "산수유 꽃길 산책",
    description: "전남 구례 산수유 마을 일대 꽃 축제입니다.",
    startDate: "2026-03-14",
    endDate: "2026-03-22",
    location: "전라남도 구례군",
    imageUrl: "https://picsum.photos/seed/gurye/320/200",
    lat: 35.209,
    lng: 127.465,
  },
  {
    id: "f_uc8_uiseong",
    kind: "festival",
    name: "산수유마을 꽃맞이 한마당",
    summary: "의성 산수유마을 봄 행사",
    description: "경북 의성 산수유마을에서 열리는 꽃맞이 행사입니다.",
    startDate: "2026-03-21",
    endDate: "2026-03-29",
    location: "경상북도 의성군",
    imageUrl: "https://picsum.photos/seed/uiseong/320/200",
    lat: 36.352,
    lng: 128.697,
  },
];

for (const p of seed) places.set(p.id, p);

