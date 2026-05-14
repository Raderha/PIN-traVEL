/**
 * 상세 경로·일차별 방문지를 바탕으로 사용자용 일정 문구 생성 (Gemini)
 */

import { ApiError, GoogleGenAI } from "@google/genai";

const MODEL = String(process.env.GEMINI_MODEL ?? "").trim() || "gemini-2.5-pro";

function formatDurationKo(ms) {
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}시간 ${r}분` : `${h}시간`;
}

function formatDistanceKo(meters) {
  if (!Number.isFinite(meters)) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace(/\.0$/, "")} km`;
  return `${Math.round(meters)} m`;
}

/**
 * @param {{
 *   tripStartDate: string
 *   departureQuery: string
 *   legs: Array<{ fromTitle: string; toTitle: string; distanceM: number; durationMs: number }>
 *   stops: Array<{ order: number; title: string; dayIndex: number; fee?: string | null; time?: string | null }>
 * }} payload
 */
function buildDataBlock(payload) {
  const lines = [];
  lines.push(`여행 시작일: ${payload.tripStartDate}`);
  lines.push(`출발지(표기): ${payload.departureQuery}`);
  lines.push("");
  lines.push("=== 차량 이동 구간 (상세 정보와 동일) ===");
  payload.legs.forEach((leg, i) => {
    lines.push(
      `${i + 1}. ${leg.fromTitle} → ${leg.toTitle} | 약 ${formatDurationKo(leg.durationMs)} | ${formatDistanceKo(leg.distanceM)}`,
    );
  });
  lines.push("");
  lines.push("=== 일차별 방문 순서 (장바구니 일차와 동일, order는 지도 번호) ===");
  const byDay = new Map();
  for (const s of payload.stops) {
    const d = Number.isFinite(s.dayIndex) ? s.dayIndex : 0;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(s);
  }
  const dayKeys = [...byDay.keys()].sort((a, b) => a - b);
  for (const d of dayKeys) {
    lines.push(`[${d + 1}일차]`);
    for (const s of byDay.get(d) ?? []) {
      lines.push(`  - ${s.order}. ${s.title}${s.time ? ` (운영·관람: ${s.time})` : ""}${s.fee ? ` (요금: ${s.fee})` : ""}`);
    }
  }
  return lines.join("\n");
}

/**
 * @param {Parameters<typeof buildDataBlock>[0]} payload
 * @param {string} apiKey
 * @param {AbortSignal} [signal]
 * @returns {Promise<string>}
 */
export async function generateItineraryScheduleNarrative(payload, apiKey, signal) {
  const key = String(apiKey ?? "").trim();
  if (!key) {
    const err = new Error("GEMINI_KEY_MISSING");
    throw err;
  }

  const block = buildDataBlock(payload);
  const prompt = `아래는 PIN-traVEL 앱에서 만든 여행 차량 이동 경로와 일차별 방문지 원본 데이터입니다.

${block}

다음 규칙으로 **한국어** 일정표만 출력하세요.

1) 장바구니에서 정한 1일차·2일차(데이터에 있는 모든 일차) 구분을 반드시 유지하고, 각 일차는 「1일차」「2일차」처럼 제목 줄로 시작하세요.
2) 각 일차 안에서는 방문 순서(order)대로 장소를 나열하고, 출발지에서 첫 방문지·방문지 사이 이동은 위 구간 데이터와 숫자·시간·거리가 어긋나지 않게 반영하세요.
3) 불필요한 서론·JSON·코드블록·영어 설명은 쓰지 마세요. 여행객이 당일 보기 좋게 Markdown(# 소제목, - 목록, 굵게)을 사용해도 됩니다.
4) 운영·요금 정보가 stops에 있으면 일정에 간단히 녹여 넣고, 없으면 억지로 채우지 마세요.`;

  const ai = new GoogleGenAI({ apiKey: key });
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        abortSignal: signal,
        temperature: 0.35,
        maxOutputTokens: 4096,
      },
    });
    const text = typeof response.text === "string" ? response.text.trim() : "";
    if (!text) {
      const err = new Error("EMPTY_GEMINI_RESPONSE");
      throw err;
    }
    return text;
  } catch (e) {
    if (e instanceof ApiError) {
      /** @type {Error & { status?: number }} */
      const err = new Error(e.message);
      err.status = e.status;
      throw err;
    }
    throw e;
  }
}
