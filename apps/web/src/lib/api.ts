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

export type AuthUser = { id: string; username: string; email?: string | null }

export type LoginResponse = { ok: true; token: string; user: AuthUser }
export type SignupResponse = { ok: true; user: AuthUser }

export function signup(params: { username: string; password: string; email: string }, signal?: AbortSignal) {
  return postJson<SignupResponse>('/api/auth/signup', params, signal)
}

export function login(params: { username: string; password: string }, signal?: AbortSignal) {
  return postJson<LoginResponse>('/api/auth/login', params, signal)
}

