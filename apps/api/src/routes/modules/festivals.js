/**
 * 담당 유스케이스: UC8(축제 일정 달력)
 * 참고: UC4-REQ-6(지도 화면의 정보 요약형 핀 중 '축제' 핀 기간 필터링)은 지도 조회(UC4) 흐름에 해당하며,
 *      본 파일은 달력·단일 일자 조회용 축제 데이터 API만 제공한다.
 * 역할: 월별 달력(일자별 개수)·단일 날짜 선택 시 축제 목록 API 제공(날짜 구간 다중 선택 미지원)
 */
import { Router } from "express";
import { z } from "zod";

import { getMongoDb } from "../../storage/mongo.js";

export const festivalsRouter = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

function festivalsCol() {
  return getMongoDb().collection("festivals");
}

/** startDate/endDate가 YYYY-MM-DD일 때 문자열 비교로 하루 포함 여부 판별 */
function festivalActiveOnDate(f, day) {
  if (!f.startDate || !f.endDate) return false;
  return f.startDate <= day && f.endDate >= day;
}

/** 축제 기간과 달력 구간 [from, to]가 하루라도 겹치는지 (YYYY-MM-DD 비교, 월 경계 계산용) */
function festivalOverlapsInclusiveRange(f, from, to) {
  if (!f.startDate || !f.endDate) return false;
  return !(f.endDate < from || f.startDate > to);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/** 해당 연·월 달력(1일~말일)과 축제 기간이 하루라도 겹치는지 */
function festivalOverlapsCalendarMonth(f, year, month) {
  const last = daysInMonth(year, month);
  const ym = `${year}-${pad2(month)}`;
  return festivalOverlapsInclusiveRange(f, `${ym}-01`, `${ym}-${pad2(last)}`);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function festivalListItem(f) {
  return {
    contentId: f.contentId,
    title: f.title,
    startDate: f.startDate,
    endDate: f.endDate,
    address: f.address ?? null,
    location: f.location ?? null,
    image: f.image ?? null,
    tel: f.tel ?? null,
    overview: f.overview ?? null,
    eventPlace: f.eventPlace ?? null,
    useTime: f.useTime ?? null,
    fee: f.fee ?? null,
  };
}

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

// 메인 페이지: 오늘 기준 진행 중인 축제 중 우선 노출할 목록
festivalsRouter.get("/main/active", async (req, res) => {
  const parsed = z
    .object({
      date: isoDate.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const date = parsed.data.date ?? todayIsoDate();
  const limit = parsed.data.limit ?? 6;
  const festivals = await festivalsCol()
    .find(
      { startDate: { $lte: date }, endDate: { $gte: date } },
      {
        projection: {
          _id: 0,
          contentId: 1,
          title: 1,
          startDate: 1,
          endDate: 1,
          address: 1,
          location: 1,
          image: 1,
          tel: 1,
          overview: 1,
          eventPlace: 1,
          useTime: 1,
          fee: 1,
        },
      }
    )
    .sort({ endDate: 1, startDate: 1, title: 1 })
    .limit(limit)
    .toArray();
  return res.json({ ok: true, date, festivals: festivals.map(festivalListItem) });
});

// UC8: 달력 그리드 — 각 일자별 '그날 진행 중인 축제' 개수(03-01~03-12 축제는 1~12일 count에 반영, 해당 일 선택 시 /calendar/day에도 동일)
festivalsRouter.get("/calendar/day-counts", async (req, res) => {
  const parsed = z
    .object({
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
    })
    .safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { year, month } = parsed.data;
  const lastDay = daysInMonth(year, month);
  const ym = `${year}-${pad2(month)}`;
  const monthStart = `${ym}-01`;
  const monthEnd = `${ym}-${pad2(lastDay)}`;

  const festivals = await festivalsCol()
    .find(
      { startDate: { $lte: monthEnd }, endDate: { $gte: monthStart } },
      { projection: { contentId: 1, title: 1, startDate: 1, endDate: 1 } }
    )
    .toArray();
  const days = [];
  for (let d = 1; d <= lastDay; d++) {
    const date = `${ym}-${pad2(d)}`;
    const count = festivals.filter((f) => festivalActiveOnDate(f, date)).length;
    days.push({ date, count });
  }
  return res.json({ ok: true, year, month, days });
});

// UC8: 달력에서 날짜 선택 시 — 해당 일이 기간에 포함되는 축제 목록(지도 탭 연동용 id·좌표 포함)
festivalsRouter.get("/calendar/day", async (req, res) => {
  const parsed = z.object({ date: isoDate }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ ok: false, error: "INVALID_QUERY" });

  const { date } = parsed.data;
  const festivals = await festivalsCol()
    .find(
      { startDate: { $lte: date }, endDate: { $gte: date } },
      {
        projection: {
          _id: 0,
          contentId: 1,
          title: 1,
          startDate: 1,
          endDate: 1,
          address: 1,
          location: 1,
          image: 1,
          tel: 1,
          overview: 1,
          eventPlace: 1,
          useTime: 1,
          fee: 1,
        },
      }
    )
    .toArray();
  return res.json({ ok: true, date, festivals: festivals.map(festivalListItem) });
});

