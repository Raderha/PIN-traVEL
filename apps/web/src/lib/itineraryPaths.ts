export const ITINERARY_DAY_COLORS = ['#2563eb', '#7c3aed', '#059669', '#ea580c', '#db2777'] as const

export function itineraryDayColor(dayIndex: number): string {
  return ITINERARY_DAY_COLORS[((dayIndex % ITINERARY_DAY_COLORS.length) + ITINERARY_DAY_COLORS.length) % ITINERARY_DAY_COLORS.length]
}

/** 구간 path를 이어 붙일 때 중복 꼭짓점 제거(서버 mergedPath와 동일 규칙) */
export function concatPathSegments(
  segments: Array<Array<{ lat: number; lng: number }>>,
): Array<{ lat: number; lng: number }> {
  const out: Array<{ lat: number; lng: number }> = []
  for (const seg of segments) {
    if (!seg?.length) continue
    if (out.length === 0) {
      out.push(...seg)
      continue
    }
    const last = out[out.length - 1]
    const first = seg[0]
    if (last && first && last.lat === first.lat && last.lng === first.lng) {
      out.push(...seg.slice(1))
    } else {
      out.push(...seg)
    }
  }
  return out
}

/** `legs[j]`의 도착지는 `stops[j]` — j번째 구간이 속한 일차 = 해당 정류장의 일차 */
export function legIndicesForStopDay(stopDayPerStop: number[], day: number): number[] {
  const out: number[] = []
  for (let j = 0; j < stopDayPerStop.length; j++) {
    if (stopDayPerStop[j] === day) out.push(j)
  }
  return out
}

export function maxStopDayIndex(stopDayPerStop: number[]): number {
  if (!stopDayPerStop.length) return 0
  return stopDayPerStop.reduce((m, d) => Math.max(m, d), 0)
}
