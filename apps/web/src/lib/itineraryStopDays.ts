import type { SummaryPin } from './api'

/**
 * 여러 일차 맨 끝이 같은 핀이면 숙소로 본다(여행 중 숙소 고정).
 * `tripHotelId`가 비어도(새로고침 등) 경로에 숙소→다음날 첫 장소 구간이 남게 한다.
 */
export function inferOvernightStayId(cartDays: SummaryPin[][]): string | null {
  if (cartDays.length < 2) return null
  const counts = new Map<string, number>()
  for (const day of cartDays) {
    const id = day[day.length - 1]?.id
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [id, n] of counts) {
    if (n > bestN) {
      best = id
      bestN = n
    }
  }
  return bestN >= 2 ? best : null
}

function overnightStayId(cartDays: SummaryPin[][], tripHotelId: string | null): string | null {
  return tripHotelId || inferOvernightStayId(cartDays)
}

/**
 * 일차 순·각 일 안 순서대로, 좌표가 있는 핀만.
 * 기본은 같은 `id`는 한 번만 넣음.
 * 숙소(tripHotelId 또는 여러 일 공통 마지막 핀)는 **매 일차에 다시 등장할 때마다** 포함.
 */
export function flattenCartPinsWithLocation(cartDays: SummaryPin[][], tripHotelId: string | null = null): SummaryPin[] {
  const stayId = overnightStayId(cartDays, tripHotelId)
  const out: SummaryPin[] = []
  const seen = new Set<string>()
  for (const day of cartDays) {
    for (const pin of day) {
      const { lat, lng } = pin.location
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const allowRepeatStay = Boolean(stayId && pin.id === stayId)
      if (seen.has(pin.id)) {
        if (!allowRepeatStay) continue
      } else {
        seen.add(pin.id)
      }
      out.push(pin)
    }
  }
  return out
}

/** `flattenCartPinsWithLocation`과 동일한 순서·스킵 규칙으로 일차 인덱스 배열 생성 */
export function computeStopDayIndicesFromCart(cartDays: SummaryPin[][], tripHotelId: string | null = null): number[] {
  const stayId = overnightStayId(cartDays, tripHotelId)
  const out: number[] = []
  const seen = new Set<string>()
  for (let d = 0; d < cartDays.length; d++) {
    for (const pin of cartDays[d]) {
      const lat = pin.location?.lat
      const lng = pin.location?.lng
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const allowRepeatStay = Boolean(stayId && pin.id === stayId)
      if (seen.has(pin.id)) {
        if (!allowRepeatStay) continue
      } else {
        seen.add(pin.id)
      }
      out.push(d)
    }
  }
  return out
}
