/**
 * 담당 유스케이스: UC8(축제 일정 달력)
 * 참고: UC4-REQ-6(지도 화면의 정보 요약형 핀 중 '축제' 핀 기간 필터링)은 지도 조회(UC4) 흐름에 해당하며,
 *      본 파일은 달력/기간조회용 축제 데이터 API만 제공한다.
 * 역할: 월별 축제 목록(달력 뷰) 및 날짜 범위 기반 축제 조회 API 제공
 */
import { Router } from "express";
import { z } from "zod";

import { places } from "../../storage/memory.js";

export const festivalsRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

function listFestivals() {
  return [...places.values()].filter((p) => p.kind === "festival");
}

/** startDate/endDate가 YYYY-MM-DD일 때 문자열 비교로 하루 포함 여부 판별 */
function festivalActiveOnDate(f, day) {
  if (!f.startDate || !f.endDate) return false;
  return f.startDate <= day && f.endDate >= day;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function festivalListItem(f) {
  return {
    id: f.id,
    name: f.name,
    startDate: f.startDate,
    endDate: f.endDate,
    location: f.location ?? null,
    imageUrl: f.imageUrl ?? null,
    lat: f.lat,
    lng: f.lng,
  };
}

// UC8: 달력 그리드 — 해당 월의 각 일자별 '그날 진행 중인 축제' 개수
festivalsRouter.get("/calendar/day-counts", (req, res) => {
  const parsed = z
    .object({
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { year, month } = parsed.data;
  const festivals = listFestivals();
  const lastDay = daysInMonth(year, month);
  const ym = `${year}-${pad2(month)}`;
  const days = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${ym}-${pad2(d)}`;
    const count = festivals.filter((f) => festivalActiveOnDate(f, date)).length;
    days.push({ date, count });
  }
  return res.json({ ok: true, year, month, days });
});

// UC8: 달력에서 날짜 선택 시 — 해당 일이 기간에 포함되는 축제 목록(지도 탭 연동용 id·좌표 포함)
festivalsRouter.get("/calendar/day", (req, res) => {
  const parsed = z.object({ date: isoDate }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { date } = parsed.data;
  const festivals = listFestivals().filter((f) => festivalActiveOnDate(f, date));
  return res.json({ ok: true, date, festivals: festivals.map(festivalListItem) });
});

// UC8: 월별 축제 목록(달력용)
festivalsRouter.get("/month", (req, res) => {
  const parsed = z
    .object({
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { year, month } = parsed.data;
  const ym = `${year}-${String(month).padStart(2, "0")}`;

  const festivals = [...places.values()].filter((p) => p.kind === "festival" && (p.startDate?.startsWith(ym) || p.endDate?.startsWith(ym)));
  return res.json({
    ok: true,
    festivals: festivals.map((f) => festivalListItem(f)),
  });
});

// UC8-REQ-2: 특정 날짜(또는 범위) 상세
festivalsRouter.get("/range", (req, res) => {
  const parsed = z
    .object({
      from: z.string().min(10),
      to: z.string().min(10),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { from, to } = parsed.data;
  const list = listFestivals();
  const within = (p) => {
    if (!p.startDate || !p.endDate) return false;
    return !(p.endDate < from || p.startDate > to);
  };

  return res.json({ ok: true, festivals: list.filter(within) });
});

