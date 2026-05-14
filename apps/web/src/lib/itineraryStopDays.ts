import type { SummaryPin } from './api'

/**
 * 일차 순·각 일 안 순서대로, 좌표가 있는 핀만.
 * 기본은 같은 `id`는 한 번만 넣음.
 * `tripHotelId`와 같은 숙소는 **매 일차에 다시 등장할 때마다** 포함(여러 일 같은 숙소 → 경로에 숙소→다음일 첫 장소 구간 반영).
 */
export function flattenCartPinsWithLocation(cartDays: SummaryPin[][], tripHotelId: string | null = null): SummaryPin[] {
  const out: SummaryPin[] = []
  const seen = new Set<string>()
  for (const day of cartDays) {
    for (const pin of day) {
      const { lat, lng } = pin.location
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const allowRepeatHotel = Boolean(tripHotelId && pin.id === tripHotelId)
      if (seen.has(pin.id)) {
        if (!allowRepeatHotel) continue
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
  const out: number[] = []
  const seen = new Set<string>()
  for (let d = 0; d < cartDays.length; d++) {
    for (const pin of cartDays[d]) {
      const lat = pin.location?.lat
      const lng = pin.location?.lng
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue
      const allowRepeatHotel = Boolean(tripHotelId && pin.id === tripHotelId)
      if (seen.has(pin.id)) {
        if (!allowRepeatHotel) continue
      } else {
        seen.add(pin.id)
      }
      out.push(d)
    }
  }
  return out
}
