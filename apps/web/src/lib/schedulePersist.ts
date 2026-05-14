import type {
  ItineraryRouteResult,
  ScheduleLegCompact,
  ScheduleRoutePersist,
  ScheduleVisitDay,
  ScheduleVisitPin,
  SummaryPin,
} from './api'

/** 앱 기본 여행 지역(마이페이지·필터와 맞춤) */
export const SCHEDULE_DEFAULT_REGION = 'busan'

function addCalendarDaysIso(iso: string, addDays: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return iso.trim()
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + addDays)
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function trimVisitPin(pin: SummaryPin): ScheduleVisitPin {
  return {
    id: pin.id,
    title: pin.title,
    kind: pin.kind,
    contentId: pin.contentId,
    contentTypeId: pin.contentTypeId ?? null,
    location: { lat: pin.location.lat, lng: pin.location.lng },
  }
}

/** 일차별 날짜·방문지(좌표는 장소 1곳당 한 점만, 경로 폴리라인 없음) */
export function buildVisitDaysFromCart(cartDays: SummaryPin[][], tripStartDate: string): ScheduleVisitDay[] {
  return cartDays.map((dayPins, dayIndex) => ({
    dayIndex,
    date: addCalendarDaysIso(tripStartDate, dayIndex),
    stops: dayPins.map(trimVisitPin),
  }))
}

/**
 * 경로 폴리라인·orderedStops·중복 출발지 문구 제외.
 * `legs`에는 `toTitle`만 두고, from은 UI에서 `departure` + 직전 `toTitle`로 복원.
 */
export function buildRouteCompactForSchedule(route: ItineraryRouteResult): ScheduleRoutePersist {
  const road =
    route.departure.geminiRoadAddress?.trim() ||
    route.departure.roadAddress?.trim() ||
    null

  return {
    departureGeo: { lat: route.departure.lat, lng: route.departure.lng },
    departureRoad: road,
    totals: {
      distanceM: route.totalDistanceM,
      durationMs: route.totalDurationMs,
    },
    legs: route.legs.map((leg) => ({
      toTitle: leg.toTitle,
      distanceM: leg.distanceM,
      durationMs: leg.durationMs,
    })),
  }
}

/** DB에 압축 저장된 `legs` → UI용 전체 구간(from/to 제목 복원) */
export function expandScheduleLegsForDisplay(
  departure: string,
  legs: ScheduleLegCompact[],
): Array<{ fromTitle: string; toTitle: string; distanceM: number; durationMs: number }> {
  return legs.map((leg, i) => ({
    fromTitle: i === 0 ? departure : legs[i - 1].toTitle,
    toTitle: leg.toTitle,
    distanceM: leg.distanceM,
    durationMs: leg.durationMs,
  }))
}
