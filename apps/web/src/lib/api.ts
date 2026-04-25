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
  kind: 'festival' | 'tour'
  iconType: 'festival' | 'palace' | 'natural'
  title: string
  subtitle: string | null
  address: { addr1: string | null; addr2: string | null } | null
  image: string | null
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

export type AuthUser = { id: string; username: string; email?: string | null }

export type LoginResponse = { ok: true; token: string; user: AuthUser }
export type SignupResponse = { ok: true; user: AuthUser }

export function signup(params: { username: string; password: string; email: string }, signal?: AbortSignal) {
  return postJson<SignupResponse>('/api/auth/signup', params, signal)
}

export function login(params: { username: string; password: string }, signal?: AbortSignal) {
  return postJson<LoginResponse>('/api/auth/login', params, signal)
}

