import type { FestivalListItem } from './api'

/** 한국관광공사 TourAPI areacode → 시·도 라벨(주소 없을 때 보조) */
const AREA_CODE_TO_SIDO: Record<string, string> = {
  '1': '서울특별시',
  '2': '인천광역시',
  '3': '대전광역시',
  '4': '대구광역시',
  '5': '광주광역시',
  '6': '부산광역시',
  '7': '울산광역시',
  '8': '세종특별자치시',
  '31': '경기도',
  '32': '강원특별자치도',
  '33': '충청북도',
  '34': '충청남도',
  '35': '경상북도',
  '36': '경상남도',
  '37': '전북특별자치도',
  '38': '전라남도',
  '39': '제주특별자치도',
}

export function festivalRegionLabel(f: FestivalListItem): string {
  const addr1 = f.address?.addr1?.trim()
  if (addr1) {
    const m = addr1.match(/^([가-힣]+(?:광역시|특별시|특별자치시|특별자치도))\b/)
    if (m) return m[1]
    const m2 = addr1.match(/^(세종특별자치시|제주특별자치도)\b/)
    if (m2) return m2[1]
    const m3 = addr1.match(/^(부산|대구|인천|광주|대전|울산)(?=\s)/)
    if (m3) return `${m3[1]}광역시`
  }
  const code = f.area?.areaCode?.trim()
  if (code && AREA_CODE_TO_SIDO[code]) return AREA_CODE_TO_SIDO[code]
  if (f.idongCode?.startsWith('26')) return '부산광역시'
  return '지역 미상'
}

/** null·빈 값·불가 문구 → false(주차 불가능 그룹). 가능 문구만 true. */
export function festivalParkingPossible(f: FestivalListItem): boolean {
  const p = f.parking?.trim()
  if (!p) return false
  if (/불가|없음|없다|무시|미제공|확인\s*불가|주차\s*불가/i.test(p)) return false
  if (/가능|있음|주차장|유료\s*주차|무료\s*주차|주차\s*\(/i.test(p)) return true
  return false
}

function clampHour(n: number): number | null {
  if (!Number.isFinite(n)) return null
  if (n < 0 || n > 24) return null
  return n
}

/**
 * 이용시간 문자열에서 오전(12시 미만 구간)·오후(12시 이상 구간) 포함 여부.
 * 파싱 불가 시 필터에서 제외되지 않도록 둘 다 true.
 */
export function festivalUseTimeSlots(f: FestivalListItem): { morning: boolean; afternoon: boolean } {
  const t = f.useTime?.trim()
  if (!t) return { morning: true, afternoon: true }

  const hours: number[] = []
  for (const m of t.matchAll(/(\d{1,2})\s*:\s*(\d{2})/g)) {
    const h = clampHour(Number(m[1]))
    if (h !== null) hours.push(h)
  }
  for (const m of t.matchAll(/(\d{1,2})\s*시/g)) {
    const h = clampHour(Number(m[1]))
    if (h !== null) hours.push(h)
  }
  if (hours.length === 0) return { morning: true, afternoon: true }

  const min = Math.min(...hours)
  const max = Math.max(...hours)
  return {
    morning: min < 12,
    afternoon: max >= 12 || min >= 12,
  }
}

/** 카드에 표시할 요약 라벨 */
export function festivalTimeSlotLabel(f: FestivalListItem): string {
  const { morning, afternoon } = festivalUseTimeSlots(f)
  if (morning && afternoon) return '오전·오후'
  if (morning) return '오전'
  if (afternoon) return '오후'
  return '시간 미상'
}

export type CalendarTimeSlotFilter = 'all' | 'morning' | 'afternoon'
export type CalendarParkingFilter = 'all' | 'yes' | 'no'

export function festivalPassesCalendarFilters(
  f: FestivalListItem,
  region: string,
  timeSlot: CalendarTimeSlotFilter,
  parking: CalendarParkingFilter,
): boolean {
  if (region !== 'all' && festivalRegionLabel(f) !== region) return false
  if (timeSlot !== 'all') {
    const slots = festivalUseTimeSlots(f)
    if (timeSlot === 'morning' && !slots.morning) return false
    if (timeSlot === 'afternoon' && !slots.afternoon) return false
  }
  if (parking !== 'all') {
    const ok = festivalParkingPossible(f)
    if (parking === 'yes' && !ok) return false
    if (parking === 'no' && ok) return false
  }
  return true
}

export function sortedRegionOptions(festivals: FestivalListItem[]): string[] {
  const set = new Set<string>()
  for (const f of festivals) set.add(festivalRegionLabel(f))
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
}
