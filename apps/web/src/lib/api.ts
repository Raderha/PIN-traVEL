export type DayCountsResponse = {
  ok: true
  year: number
  month: number
  days: Array<{ date: string; count: number }>
}

export type FestivalListItem = {
  contentId: string
  title: string
  startDate: string
  endDate: string
  address: { addr1: string | null; addr2: string | null } | null
  location: { type: 'Point'; coordinates: [number, number] } | null
  image: string | null
  tel: string | null
  overview: string | null
  eventPlace: string | null
  useTime: string | null
  fee: string | null
  parking?: string | null
  idongCode?: string | null
  idong?: { regnCd: string | null; signguCd: string | null } | null
  area?: { areaCode: string | null; sigunguCode: string | null } | null
}

export type DayFestivalsResponse = {
  ok: true
  date: string
  festivals: FestivalListItem[]
}

export type MainFestivalsResponse = {
  ok: true
  date: string
  festivals: FestivalListItem[]
}

export type SummaryPin = {
  id: string
  contentId: string
  /** TourAPI `contenttypeid` — 예: `32` 숙박 */
  contentTypeId?: string | null
  kind: 'festival' | 'tour'
  iconType: 'festival' | 'palace' | 'natural'
  title: string
  subtitle: string | null
  address: { addr1: string | null; addr2: string | null } | null
  image: string | null
  images?: { firstimage: string | null; firstimage2: string | null } | null
  zipcode?: string | null
  tel: string | null
  infoCenter?: string | null
  overview: string | null
  detail?: {
    eventPlace?: string | null
    category?: { cat1: string | null; cat2: string | null; cat3: string | null } | null
    parking?: string | null
  }
  summary: {
    fee?: string | null
    time?: string | null
    startDate?: string | null
    endDate?: string | null
    restDate?: string | null
  }
  location: { lat: number; lng: number }
}

export type SummaryPinsResponse = {
  ok: true
  region: string
  date: string | null
  from?: string | null
  to?: string | null
  pins: SummaryPin[]
}

export type AiRecommendationItem = {
  contentId: string
  title: string
  address: { addr1: string | null; addr2: string | null } | null
  image: string | null
  tel: string | null
  category: { cat1: string | null; cat2: string | null; cat3: string | null } | null
  location: { lat: number; lng: number } | null
  distanceMeters: number
}

export type AiRecommendationGroup = {
  radiusKm: number
  items: AiRecommendationItem[]
}

export type AiRecommendationsResponse = {
  ok: true
  origin: { lat: number; lng: number }
  limit: number
  search: { defaultRadiusKm: number; maxRadiusKm: number; stepKm: number }
  food: AiRecommendationGroup
  hotel: AiRecommendationGroup
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, credentials: 'include' })
  if (!res.ok) throw new Error(`HTTP_${res.status}`)
  return (await res.json()) as T
}

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`HTTP_${res.status}`)
  return (await res.json()) as T
}

export function fetchFestivalDayCounts(params: { year: number; month: number }, signal?: AbortSignal) {
  const qs = new URLSearchParams({
    year: String(params.year),
    month: String(params.month),
  })
  return getJson<DayCountsResponse>(`/api/festivals/calendar/day-counts?${qs.toString()}`, signal)
}

export function fetchFestivalsByDay(params: { date: string }, signal?: AbortSignal) {
  const qs = new URLSearchParams({ date: params.date })
  return getJson<DayFestivalsResponse>(`/api/festivals/calendar/day?${qs.toString()}`, signal)
}

export function fetchMainFestivals(params: { date: string; limit?: number }, signal?: AbortSignal) {
  const qs = new URLSearchParams({
    date: params.date,
    limit: String(params.limit ?? 6),
  })
  return getJson<MainFestivalsResponse>(`/api/festivals/main/active?${qs.toString()}`, signal)
}

export function fetchMapSummaryPins(
  params: {
    kind?: 'all' | 'festival' | 'tour'
    region?: 'busan'
    date?: string
    from?: string
    to?: string
    limit?: number
  },
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({
    kind: params.kind ?? 'all',
    region: params.region ?? 'busan',
    limit: String(params.limit ?? 40),
  })
  if (params.date) qs.set('date', params.date)
  if (params.from) qs.set('from', params.from)
  if (params.to) qs.set('to', params.to)
  return getJson<SummaryPinsResponse>(`/api/map/summary-pins?${qs.toString()}`, signal)
}

export function fetchNearbyAiRecommendations(
  params: { lat: number; lng: number; limit?: number },
  signal?: AbortSignal,
) {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    limit: String(params.limit ?? 3),
  })
  return getJson<AiRecommendationsResponse>(`/api/airecommand/nearby?${qs.toString()}`, signal)
}

export type AuthUser = { id: string; username: string; email?: string | null }

export type LoginResponse = { ok: true; token: string; user: AuthUser }
export type SignupResponse = { ok: true; user: AuthUser }
export type CreateSessionResponse = { ok: true; sessionId: string }

export function signup(params: { username: string; password: string; email: string }, signal?: AbortSignal) {
  return postJson<SignupResponse>('/api/auth/signup', params, signal)
}

export function login(params: { username: string; password: string }, signal?: AbortSignal) {
  return postJson<LoginResponse>('/api/auth/login', params, signal)
}

export async function createSession(signal?: AbortSignal) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({}),
    signal,
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`HTTP_${res.status}`)
  return (await res.json()) as CreateSessionResponse
}

export type ItineraryRouteStopInput = {
  lat: number
  lng: number
  title: string
  contentId?: string
  fee?: string | null
  time?: string | null
  kind?: string
}

export type ItineraryRouteLeg = {
  fromTitle: string
  toTitle: string
  distanceM: number
  durationMs: number
}

export type ItineraryRouteStopResult = ItineraryRouteStopInput & { order: number }

export type ItineraryRouteResult = {
  ok: true
  departure: {
    query: string
    /** 서버에서 Gemini로 정규화한 도로명(키가 있을 때만) */
    geminiRoadAddress?: string | null
    lat: number
    lng: number
    roadAddress: string | null
    jibunAddress: string | null
  }
  stops: ItineraryRouteStopResult[]
  path: Array<{ lat: number; lng: number }>
  /** `legs[i]` 구간의 운전 경로 좌표(지도 일차 시각화용) — 구 API 응답에는 없을 수 있음 */
  legPaths?: Array<Array<{ lat: number; lng: number }>>
  legs: ItineraryRouteLeg[]
  totalDistanceM: number
  totalDurationMs: number
}

/** 일정 확정 저장용 — 장바구니 핀 요약(장소당 좌표 1점) */
export type ScheduleVisitPin = {
  id: string
  title: string
  kind?: string
  contentId?: string
  contentTypeId?: string | null
  location: { lat: number; lng: number }
}

/** 일차별 날짜 + 그날 담은 장소(마이페이지 히스토리용) */
export type ScheduleVisitDay = {
  dayIndex: number
  date: string
  stops: ScheduleVisitPin[]
}

/** 구간별 목적지만 저장(from은 첫 구간만 `departure`, 이후는 직전 `toTitle`과 동일) */
export type ScheduleLegCompact = {
  toTitle: string
  distanceM: number
  durationMs: number
}

/** 경로 요약(중복 문자열·orderedStops 제거) */
export type ScheduleRoutePersist = {
  departureGeo: { lat: number; lng: number }
  departureRoad: string | null
  totals: { distanceM: number; durationMs: number }
  legs: ScheduleLegCompact[]
}

export type PostScheduleConfirmBody = {
  /** 여행 지역 코드(예: busan) */
  region?: string
  tripStartDate: string
  /** 출발지 검색/입력 문구(최상위 한 곳만) */
  departure: string
  tripHotelId?: string | null
  visitDays: ScheduleVisitDay[]
} & ScheduleRoutePersist

export type PostScheduleConfirmResponse = { ok: true; scheduleId: string }

/** 확정 일정을 서버 `schedule` 컬렉션에 저장 (Bearer 토큰 필요) */
export async function postScheduleConfirm(body: PostScheduleConfirmBody, signal?: AbortSignal): Promise<PostScheduleConfirmResponse> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
  if (!token) throw new Error('UNAUTHORIZED')

  const res = await fetch('/api/schedule/confirm', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      region: body.region ?? 'busan',
      tripStartDate: body.tripStartDate,
      departure: body.departure,
      tripHotelId: body.tripHotelId ?? null,
      visitDays: body.visitDays,
      departureGeo: body.departureGeo,
      departureRoad: body.departureRoad ?? null,
      totals: body.totals,
      legs: body.legs,
    }),
    signal,
    credentials: 'include',
  })

  const data = (await res.json()) as { ok?: boolean; scheduleId?: string; error?: string }
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok || !data.ok) {
    const code = typeof data.error === 'string' ? data.error : `HTTP_${res.status}`
    throw new Error(code)
  }
  return { ok: true, scheduleId: String(data.scheduleId) }
}

/** `/api/itinerary/route` 400 등 실패 시 본문 (GEOCODE_NOT_FOUND 디버그) */
export type ItineraryRouteFailBody = {
  ok?: false
  error?: string
  departureQuery?: string
  geocodeQueryAttempted?: string
  geocodeFallbackAttempted?: string | null
  geminiRoadAddress?: string | null
  geminiRawModelText?: string | null
  geminiHttpStatus?: number | null
  geminiApiError?: string | null
  geminiResponseSnippet?: string | null
  geminiModelsTried?: string | null
  geminiSkipped?: boolean
  geminiModel?: string | null
  code?: number
}

export async function postItineraryRoute(
  body: {
    departureQuery: string
    /** 브라우저 Geocoder로 구한 좌표 — 있으면 서버에서 REST 지오코딩 생략 */
    departureLat?: number
    departureLng?: number
    departureRoadAddress?: string | null
    departureJibunAddress?: string | null
    stops: ItineraryRouteStopInput[]
  },
  signal?: AbortSignal,
): Promise<ItineraryRouteResult> {
  const res = await fetch('/api/itinerary/route', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    credentials: 'include',
  })
  const data = (await res.json()) as ItineraryRouteFailBody & Partial<ItineraryRouteResult>
  if (!res.ok) {
    const code = typeof data.error === 'string' ? data.error : `HTTP_${res.status}`
    const e = new Error(code)
    ;(e as Error & { cause?: ItineraryRouteFailBody }).cause = data
    throw e
  }
  if (!data.ok) {
    const code = typeof data.error === 'string' ? data.error : 'ROUTE_FAILED'
    const e = new Error(code)
    ;(e as Error & { cause?: ItineraryRouteFailBody }).cause = data
    throw e
  }
  return data as ItineraryRouteResult
}

export type ItineraryScheduleNarrativeBody = {
  tripStartDate: string
  departureQuery: string
  legs: ItineraryRouteLeg[]
  stops: Array<{
    order: number
    title: string
    dayIndex: number
    fee?: string | null
    time?: string | null
  }>
}

export type ItineraryScheduleNarrativeResult = {
  ok: true
  text: string
}

/** 상세 경로·일차별 방문지 → Gemini로 읽기 쉬운 일정 문구 */
export async function postItineraryScheduleNarrative(
  body: ItineraryScheduleNarrativeBody,
  signal?: AbortSignal,
): Promise<ItineraryScheduleNarrativeResult> {
  let res: Response
  try {
    res = await fetch('/api/itinerary/schedule-narrative', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
      credentials: 'include',
    })
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e)
    throw new Error(`NETWORK_OR_FETCH\n${m}`)
  }

  const textBody = await res.text()
  let data: { ok?: boolean; text?: string; error?: string; message?: string } = {}
  try {
    data = textBody ? (JSON.parse(textBody) as typeof data) : {}
  } catch {
    const head = textBody.trim().slice(0, 120)
    throw new Error(
      `INVALID_JSON_RESPONSE\nHTTP ${res.status}${head ? `\n응답 앞부분: ${head}` : ''}\n(Vite는 npm run dev로 켜야 /api 프록시가 localhost:4000으로 붙습니다.)`,
    )
  }

  if (!res.ok) {
    const code = typeof data.error === 'string' ? data.error : `HTTP_${res.status}`
    const detail =
      typeof data.message === 'string' && data.message.trim() ? data.message.trim().slice(0, 800) : ''
    if (code === 'GEMINI_NOT_CONFIGURED') throw new Error('GEMINI_NOT_CONFIGURED')
    throw new Error(detail ? `${code}\n${detail}` : code)
  }
  if (!data.ok || typeof data.text !== 'string') {
    throw new Error('ROUTE_NARRATIVE_INVALID')
  }
  return { ok: true, text: data.text }
}

