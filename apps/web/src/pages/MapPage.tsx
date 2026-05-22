import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import cultureIconUrl from '../assets/culture.png'
import etcIconUrl from '../assets/etc.png'
import festivalIconUrl from '../assets/festival.png'
import marketIconUrl from '../assets/market.png'
import naturalIconUrl from '../assets/natural.png'
import palaceIconUrl from '../assets/palace.png'
import pinTemplateHistoryUrl from '../assets/pin.png'
import pinTemplateFestivalUrl from '../assets/pin_festival.png'
import pinTemplateShoppingUrl from '../assets/pin_shopping.png'
import pinTemplateCultureUrl from '../assets/pin_calture.png'
import pinTemplateNaturalUrl from '../assets/pin_natural.png'
import pinTemplateEtcUrl from '../assets/pin_etc.png'
import { ItineraryRoutePanel } from '../components/ItineraryRoutePanel'
import { ItineraryScheduleModal, type ItineraryScheduleConfirmPayload } from '../components/ItineraryScheduleModal'
import {
  fetchMapSummaryPins,
  fetchNearbyAiRecommendations,
  postItineraryRoute,
  postScheduleConfirm,
  type AiRecommendationItem,
  type AiRecommendationsResponse,
  type ItineraryRouteResult,
  type ItineraryRouteStopInput,
  type SummaryPin,
} from '../lib/api'
import { concatPathSegments, itineraryDayColor, legIndicesForStopDay } from '../lib/itineraryPaths'
import { computeStopDayIndicesFromCart, flattenCartPinsWithLocation } from '../lib/itineraryStopDays'
import { isHotelPin, itineraryHotelMarkerHtml, pinForRouteStopOrder } from '../lib/pinHotel'
import { copyTextToClipboard } from '../lib/copyToClipboard'
import { buildNcpMapLanAuthHint, ncpWebUrlPatternsForOrigin } from '../lib/networkHost'
import {
  emptyCollabItinerary,
  emptyCollabItineraryNarrative,
  type CollabItineraryPayload,
} from '../lib/collabItinerary'
import { buildRouteCompactForSchedule, buildVisitDaysFromCart, SCHEDULE_DEFAULT_REGION } from '../lib/schedulePersist'
import { SessionCursorOverlay } from '../components/SessionCursorOverlay'
import { useCollabSession } from '../hooks/useCollabSession'

type NaverLatLng = unknown
type NaverPoint = unknown
type NaverSize = unknown
type NaverLatLngBounds = {
  hasLatLng(position: NaverLatLng): boolean
}
type NaverEventListener = unknown
type NaverMapInstance = {
  setCenter(position: NaverLatLng): void
  setZoom?(zoom: number): void
  getCenter?: () => NaverLatLng & { lat?: () => number; lng?: () => number; y?: number; x?: number }
  getZoom(): number
  getBounds(): NaverLatLngBounds
  setOptions?: (opts: Record<string, unknown>) => void
  morph?: (center: NaverLatLng, zoom: number) => void
}
type NaverMarkerInstance = {
  setMap(map: NaverMapInstance | null): void
}
type NaverMaps = {
  LatLng: new (lat: number, lng: number) => NaverLatLng
  Point: new (x: number, y: number) => NaverPoint
  Size: new (width: number, height: number) => NaverSize
  Map: new (element: HTMLElement, options: { center: NaverLatLng; zoom: number }) => NaverMapInstance
  Marker: new (options: {
    position: NaverLatLng
    map: NaverMapInstance
    icon?: { content: string; size: NaverSize; anchor: NaverPoint }
    zIndex?: number
  }) => NaverMarkerInstance
  Event: {
    addListener(target: unknown, eventName: string, listener: () => void): NaverEventListener
    removeListener(listener: NaverEventListener): void
  }
}

const BUSAN_CENTER = { lat: 35.1796, lng: 129.0756 }
const SINGLE_CLUSTER_MAX_ZOOM = 10
const CLUSTER_UNLOCK_ZOOM = 16
const NAVER_MAP_SCRIPT_ID = 'naver-map-script'
const NAVER_MAP_KEY_ID = import.meta.env.VITE_X_NCP_APIGW_API_KEY_ID
const FILTER_YEAR = 2026
const CART_STORAGE_KEY = 'pintravel_map_cart_days'
const MAP_FILTER_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1)
const MAP_CALENDAR_DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

type MapCalendarCell = {
  date: string
  day: number
  inMonth: boolean
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toIsoDateParts(year: number, month: number, day: number) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}

function defaultFilterViewMonth() {
  const now = new Date()
  if (now.getFullYear() === FILTER_YEAR) return now.getMonth() + 1
  return 1
}

function createDefaultFestivalFilterState() {
  const viewMonth = defaultFilterViewMonth()
  return {
    viewMonth,
    range: {
      from: toIsoDateParts(FILTER_YEAR, viewMonth, 1),
      to: toIsoDateParts(FILTER_YEAR, viewMonth, lastDayOfMonth(FILTER_YEAR, viewMonth)),
    },
  }
}

function buildMapCalendarCells(year: number, month: number): MapCalendarCell[] {
  const firstDow = new Date(year, month - 1, 1).getDay()
  const daysInMonth = lastDayOfMonth(year, month)
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevLastDay = lastDayOfMonth(prevYear, prevMonth)
  const nextMonth = month === 12 ? 1 : month + 1
  const nextYear = month === 12 ? year + 1 : year

  const cells: MapCalendarCell[] = []

  for (let i = firstDow - 1; i >= 0; i--) {
    const day = prevLastDay - i
    cells.push({ date: toIsoDateParts(prevYear, prevMonth, day), day, inMonth: false })
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: toIsoDateParts(year, month, day), day, inMonth: true })
  }
  let nextDay = 1
  while (cells.length < 42) {
    cells.push({ date: toIsoDateParts(nextYear, nextMonth, nextDay), day: nextDay, inMonth: false })
    nextDay += 1
  }
  return cells
}

function formatFilterRangeLabel(from: string, to: string) {
  const parse = (iso: string) => {
    const [, m, d] = iso.split('-').map(Number)
    return { m, d }
  }
  const a = parse(from)
  const b = parse(to)
  if (from === to) return `${a.m}월 ${a.d}일`
  if (a.m === b.m) return `${a.m}월 ${a.d}일 ~ ${b.d}일`
  return `${a.m}월 ${a.d}일 ~ ${b.m}월 ${b.d}일`
}

let naverMapScriptPromise: Promise<void> | null = null

function getNaverMaps() {
  return (window as Window & { naver?: { maps: NaverMaps } }).naver?.maps
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return entities[char]
  })
}

function compactText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed || fallback
}

function formatPinDate(date: string | null | undefined) {
  if (!date) return null
  const [year, month, day] = date.split('-')
  return `${year}.${month}.${day}`
}

function summaryDateRange(pin: SummaryPin) {
  if (pin.summary.startDate && pin.summary.endDate) {
    return `${formatPinDate(pin.summary.startDate)}~${formatPinDate(pin.summary.endDate)}`
  }
  if (pin.kind === 'tour') {
    return compactText(pin.summary.time ?? pin.summary.restDate, '관광지')
  }
  return '기간 정보 없음'
}

function addressText(pin: SummaryPin) {
  const addr1 = compactText(pin.address?.addr1, '')
  const addr2 = compactText(pin.address?.addr2, '')
  return [addr1, addr2].filter(Boolean).join(' ') || compactText(pin.subtitle, '주소 정보 없음')
}

function formatDbText(value: string | null | undefined, fallback: string) {
  const text = compactText(value, fallback).replace(/<br\s*\/?>/gi, '\n')
  return text.replace(/^(가능|불가|없음)\s*요금\s*\(([^)]+)\)$/u, '$1\n요금: $2')
}

function detailImageUrl(pin: SummaryPin) {
  return pin.image ?? pin.images?.firstimage ?? pin.images?.firstimage2 ?? null
}

function placeLabel(pin: SummaryPin) {
  if (pin.kind === 'festival') return compactText(pin.detail?.eventPlace, '행사장 정보 없음')
  return formatDbText(pin.detail?.parking, '주차 정보 없음')
}

function contactText(pin: SummaryPin) {
  return compactText(pin.tel ?? pin.infoCenter, '문의 정보 없음')
}

function overviewText(pin: SummaryPin) {
  return compactText(pin.overview, '상세 설명 정보 없음')
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters)) return ''
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')} km`
  return `${Math.round(meters)} m`
}

function recommendationAddressText(item: AiRecommendationItem) {
  const addr1 = compactText(item.address?.addr1, '')
  const addr2 = compactText(item.address?.addr2, '')
  return [addr1, addr2].filter(Boolean).join(' ') || compactText(item.tel, '상세 정보 없음')
}

function recommendationToCartPin(item: AiRecommendationItem, kind: 'food' | 'hotel'): SummaryPin | null {
  if (!item.location) return null
  const label = kind === 'food' ? '식당' : '숙소'

  return {
    id: `recommendation:${kind}:${item.contentId}`,
    contentId: item.contentId,
    contentTypeId: kind === 'hotel' ? '32' : null,
    kind: 'tour',
    iconType: 'natural',
    title: item.title,
    subtitle: recommendationAddressText(item),
    address: item.address,
    image: item.image,
    images: item.image ? { firstimage: item.image, firstimage2: null } : null,
    zipcode: null,
    tel: item.tel,
    infoCenter: item.tel,
    overview: `${label} 추천 장소입니다. ${recommendationAddressText(item)}`,
    detail: {
      category: item.category,
      parking: null,
    },
    summary: {
      fee: null,
      time: `${formatDistance(item.distanceMeters)} 거리`,
      restDate: null,
    },
    location: item.location,
  }
}

function appendHotelLastEveryDay(
  days: SummaryPin[][],
  hotel: SummaryPin,
  previousTripHotelId: string | null,
): SummaryPin[][] {
  return days.map((day) => {
    let next = day.filter((p) => p.id !== hotel.id)
    if (previousTripHotelId && previousTripHotelId !== hotel.id) {
      next = next.filter((p) => p.id !== previousTripHotelId)
    }
    return [...next, hotel]
  })
}

function isHotelLastOnAllDays(days: SummaryPin[][], hotelId: string): boolean {
  return days.length > 0 && days.every((day) => day.length > 0 && day[day.length - 1]?.id === hotelId)
}

const FILTERS = ['전체', '역사/문화', '축제', '시장/쇼핑', '전시/문화시설', '자연/공원'] as const
type MapCategory = (typeof FILTERS)[number] | '기타'
const MAP_FILTERS: MapCategory[] = [...FILTERS, '기타']

/** 카테고리 칩 “선택” 배경색 — 각 정보 요약형 핀(`pin*.png`) 톤에 맞춤 */
const MAP_CHIP_SELECTED_STYLE: Record<MapCategory, CSSProperties> = {
  전체: { background: '#111827', color: '#ffffff', borderColor: '#111827' },
  '역사/문화': { background: '#9fd8f9', color: '#0f172a', borderColor: '#7ec8ee' },
  축제: { background: '#f8c9d9', color: '#1f2937', borderColor: '#f5b8cc' },
  '시장/쇼핑': { background: '#dbd0f7', color: '#1f2937', borderColor: '#c9bef0' },
  '전시/문화시설': { background: '#fff5c9', color: '#1f2937', borderColor: '#f8e896' },
  '자연/공원': { background: '#b8efd4', color: '#064e3b', borderColor: '#8edebb' },
  기타: { background: '#e8eaef', color: '#1f2937', borderColor: '#d8dbe3' },
}

function categoryForPin(pin: SummaryPin): MapCategory {
  if (pin.kind === 'festival') return '축제'

  const cat1 = pin.detail?.category?.cat1
  const cat2 = pin.detail?.category?.cat2
  if (!cat1 || !cat2) return '기타'

  if (cat1 === 'A02' && ['A0201', 'A0205', 'A0206'].includes(cat2)) return '역사/문화'
  if (cat1 === 'A04' && ['A0401', 'A0402'].includes(cat2)) return '시장/쇼핑'
  if (cat1 === 'A02' && ['A0202', 'A0203'].includes(cat2)) return '전시/문화시설'
  if (cat1 === 'A01' && ['A0101', 'A0102'].includes(cat2)) return '자연/공원'

  return '기타'
}

function iconUrlForPin(pin: SummaryPin) {
  switch (categoryForPin(pin)) {
    case '역사/문화':
      return palaceIconUrl
    case '축제':
      return festivalIconUrl
    case '자연/공원':
      return naturalIconUrl
    case '전시/문화시설':
      return cultureIconUrl
    case '기타':
      return etcIconUrl
    case '시장/쇼핑':
      return marketIconUrl
    case '전체':
    default:
      return etcIconUrl
  }
}

function pinTemplateUrlForPin(pin: SummaryPin) {
  switch (categoryForPin(pin)) {
    case '축제':
      return pinTemplateFestivalUrl
    case '역사/문화':
      return pinTemplateHistoryUrl
    case '시장/쇼핑':
      return pinTemplateShoppingUrl
    case '전시/문화시설':
      return pinTemplateCultureUrl
    case '자연/공원':
      return pinTemplateNaturalUrl
    case '기타':
    default:
      return pinTemplateEtcUrl
  }
}

function createSummaryPinContent(pin: SummaryPin) {
  const title = escapeHtml(compactText(pin.title, '이름 없음'))
  const fee = escapeHtml(compactText(pin.summary.fee, '요금 정보 없음'))
  const dateRange = escapeHtml(summaryDateRange(pin))
  const iconUrl = escapeHtml(iconUrlForPin(pin))
  const pinUrl = escapeHtml(pinTemplateUrlForPin(pin))

  return `
    <div class="summaryPinMarker" style="background-image: url('${pinUrl}')">
      <img class="summaryPinIcon" src="${iconUrl}" alt="" />
      <div class="summaryPinText">
        <div class="summaryPinTitle">${title}</div>
        <div class="summaryPinLine">${fee}</div>
        <div class="summaryPinLine">${dateRange}</div>
      </div>
    </div>
  `
}

function createClusterPinContent(count: number, size: number) {
  return `<div class="summaryPinCluster" style="width:${size}px;height:${size}px;font-size:${size >= 52 ? 18 : 16}px">${count}</div>`
}

function averageLocation(pins: SummaryPin[]) {
  const total = pins.reduce(
    (acc, pin) => ({
      lat: acc.lat + pin.location.lat,
      lng: acc.lng + pin.location.lng,
    }),
    { lat: 0, lng: 0 },
  )
  return { lat: total.lat / pins.length, lng: total.lng / pins.length }
}

function clusterGridSize(zoom: number) {
  if (zoom <= 11) return 0.1
  if (zoom === 12) return 0.045
  if (zoom === 13) return 0.03
  if (zoom === 14) return 0.02
  if (zoom === 15) return 0.02
  return 0.01
}

function clusterPinsByZoom(pins: SummaryPin[], zoom: number) {
  if (pins.length === 0) return []
  if (zoom <= SINGLE_CLUSTER_MAX_ZOOM) {
    return [{ pins, location: averageLocation(pins) }]
  }

  const gridSize = clusterGridSize(zoom)
  const clusters = new Map<string, SummaryPin[]>()
  for (const pin of pins) {
    const latKey = Math.floor(pin.location.lat / gridSize)
    const lngKey = Math.floor(pin.location.lng / gridSize)
    const key = `${latKey}:${lngKey}`
    const cluster = clusters.get(key)
    if (cluster) cluster.push(pin)
    else clusters.set(key, [pin])
  }

  return Array.from(clusters.values()).map((cluster) => ({
    pins: cluster,
    location: averageLocation(cluster),
  }))
}

function spreadPinsForDisplay(pins: SummaryPin[]) {
  const groups = new Map<string, SummaryPin[]>()
  for (const pin of pins) {
    const key = `${pin.location.lat.toFixed(5)}:${pin.location.lng.toFixed(5)}`
    const group = groups.get(key)
    if (group) group.push(pin)
    else groups.set(key, [pin])
  }

  const displayed: Array<{ pin: SummaryPin; location: { lat: number; lng: number } }> = []
  for (const group of groups.values()) {
    if (group.length === 1) {
      displayed.push({ pin: group[0], location: group[0].location })
      continue
    }

    const radius = 0.00018
    group.forEach((pin, index) => {
      const angle = (Math.PI * 2 * index) / group.length
      displayed.push({
        pin,
        location: {
          lat: pin.location.lat + Math.sin(angle) * radius,
          lng: pin.location.lng + Math.cos(angle) * radius,
        },
      })
    })
  }

  return displayed
}

function installNaverMapAuthFailureHandler(onFail: () => void) {
  const w = window as Window & { navermap_authFailure?: () => void }
  w.navermap_authFailure = () => onFail()
}

function loadNaverMapScript(onAuthFailure?: () => void) {
  if (getNaverMaps()) return Promise.resolve()
  if (!NAVER_MAP_KEY_ID) return Promise.reject(new Error('MISSING_NAVER_MAP_KEY'))
  if (naverMapScriptPromise) return naverMapScriptPromise

  if (onAuthFailure) installNaverMapAuthFailureHandler(onAuthFailure)

  naverMapScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(NAVER_MAP_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('NAVER_MAP_LOAD_FAILED')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.id = NAVER_MAP_SCRIPT_ID
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(NAVER_MAP_KEY_ID)}`
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('NAVER_MAP_LOAD_FAILED'))
    document.head.appendChild(script)
  })

  return naverMapScriptPromise
}

function loadStoredCartDays() {
  if (typeof window === 'undefined') return [[]] as SummaryPin[][]
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY)
    if (!raw) return [[]] as SummaryPin[][]
    const parsed = JSON.parse(raw) as SummaryPin[][]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : ([[]] as SummaryPin[][])
  } catch {
    return [[]] as SummaryPin[][]
  }
}

function formatItineraryGeocodeDebug(cause: Record<string, unknown>): string {
  const lines: string[] = ['', '── Gemini·지오코딩 디버그 ──']
  const status = cause.geminiHttpStatus
  if (status === 429) {
    lines.push(
      '「HTTP 429」Gemini 무료 한도·요금제 제한일 수 있어요. Google AI Studio에서 사용량/결제를 확인하거나 apps/api/.env의 GEMINI_MODEL을 다른 모델로 바꿔 보세요.',
    )
  }
  if (status === 404) {
    lines.push(
      '「HTTP 404」해당 모델 이름이 v1beta generateContent에서 지원되지 않거나 존재하지 않을 수 있어요. GEMINI_MODEL을 gemini-flash-latest 등으로 바꾸거나, List Models로 사용 가능한 이름을 확인하세요.',
    )
  }
  const add = (label: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return
    const s = typeof v === 'boolean' ? (v ? '예' : '아니오') : String(v)
    lines.push(`${label}: ${s}`)
  }
  add('출발지(원문)', cause.departureQuery)
  add('지오코딩에 넣은 문자열', cause.geocodeQueryAttempted)
  add('지오코딩 재시도(원문)', cause.geocodeFallbackAttempted)
  add('Gemini 정규화(한 줄)', cause.geminiRoadAddress)
  add('시도한 Gemini 모델(순서)', cause.geminiModelsTried)
  if ('geminiRawModelText' in cause) {
    const t = cause.geminiRawModelText
    lines.push(`Gemini 모델 원문(성공 시만): ${t === '' || t == null ? '(없음)' : String(t)}`)
  }
  add('Gemini HTTP', cause.geminiHttpStatus)
  add('Gemini API 오류', cause.geminiApiError)
  if (cause.geminiResponseSnippet != null && String(cause.geminiResponseSnippet).trim() !== '') {
    lines.push(`Gemini 응답 일부(JSON): ${String(cause.geminiResponseSnippet)}`)
  }
  add('Gemini 미사용(키 없음 등)', cause.geminiSkipped)
  add('Gemini 모델 ID', cause.geminiModel)
  return lines.join('\n')
}

function itineraryRouteErrorMessage(code: string) {
  const map: Record<string, string> = {
    GEOCODE_NOT_FOUND:
      '출발지 좌표를 찾지 못했어요. 아래 디버그 정보에서 Gemini 응답·지오코딩에 사용한 문자열을 확인해 주세요.',
    MAPS_KEYS_NOT_CONFIGURED: '서버에 네이버 지도 API 인증 정보가 없어요. apps/api/.env를 확인해 주세요.',
    MISSING_NCP_KEY_ID:
      '서버가 API Gateway 키 ID를 못 찾았어요. apps/api/.env에 Key ID를 두거나, 로컬에서는 apps/web/.env의 X-NCP-APIGW-API-KEY-ID 또는 VITE_X_NCP_APIGW_API_KEY_ID를 씁니다. Client Secret은 브라우저에 넣지 마세요.',
    MISSING_NCP_SECRET:
      'Client Secret(인증키)이 없어요. apps/api/.env에 NCP_APIGW_API_KEY 또는 X-NCP-APIGW-API-KEY를 넣어 주세요.',
    NCP_AUTH_FAILED:
      '네이버 지도 API 인증에 실패했어요(401). apps/api/.env의 X-NCP-APIGW-API-KEY-ID와 X-NCP-APIGW-API-KEY가 콘솔의 같은 Application에서 나온 쌍인지, 앞뒤 공백·따옴표가 없는지 확인해 주세요. Application에서 Geocoding·Directions 15 사용이 켜져 있는지도 확인해 주세요. (콘솔의 Web 서비스 URL은 브라우저용 지도와 연관된 설정이며, 서버 REST 호출 성공 여부와는 별개입니다.)',
    INVALID_BODY: '요청 정보가 올바르지 않아요.',
    UPSTREAM_MAPS_ERROR: '네이버 경로 서버 응답에 문제가 있어요. 잠시 후 다시 시도해 주세요.',
  }
  return map[code] ?? `경로를 불러오지 못했어요. (${code})`
}

function createItineraryDepartureMarkerHtml() {
  return `<div class="itineraryMapNumMarker itineraryMapNumMarker--dep" aria-hidden="true">출</div>`
}

function createItineraryOrderMarkerHtml(order: number, dayIndex?: number) {
  const hue =
    dayIndex != null ? itineraryDayColor(dayIndex) : order % 2 === 1 ? '#2563eb' : '#7c3aed'
  return `<div class="itineraryMapNumMarker" style="background:${hue}" aria-hidden="true">${order}</div>`
}

function createItineraryStopMarkerHtml(
  order: number,
  dayIndex: number | undefined,
  cartDays: SummaryPin[][],
  tripHotelId: string | null,
) {
  const pin = pinForRouteStopOrder(order, cartDays, tripHotelId)
  if (pin && isHotelPin(pin)) return itineraryHotelMarkerHtml()
  return createItineraryOrderMarkerHtml(order, dayIndex)
}

function createRecommendationMarkerHtml(kind: 'food' | 'hotel', index: number) {
  return `<div class="recommendationMapMarker recommendationMapMarker--${kind}" aria-hidden="true">${index}</div>`
}

export function MapPage() {
  const location = useLocation()
  const nav = useNavigate()
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const markersRef = useRef<NaverMarkerInstance[]>([])
  const recommendationMarkersRef = useRef<NaverMarkerInstance[]>([])
  const mapListenersRef = useRef<NaverEventListener[]>([])
  const markerListenersRef = useRef<NaverEventListener[]>([])
  const recommendationMarkerListenersRef = useRef<NaverEventListener[]>([])
  const [summaryPins, setSummaryPins] = useState<SummaryPin[]>([])
  const [selectedPin, setSelectedPin] = useState<SummaryPin | null>(null)
  const [cartDays, setCartDays] = useState<SummaryPin[][]>(() => loadStoredCartDays())
  /** 여러 일차 맨 끝에 자동 배치되는 숙소(다른 숙소를 담으면 교체) */
  const [tripHotelId, setTripHotelId] = useState<string | null>(null)
  const [activeCartDay, setActiveCartDay] = useState(0)
  const [cartPanelOpen, setCartPanelOpen] = useState(true)
  const [draggingPin, setDraggingPin] = useState<{ dayIndex: number; pinId: string } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<MapCategory[]>(['전체'])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [festivalFilterEnabled, setFestivalFilterEnabled] = useState(false)
  const [filterViewMonth, setFilterViewMonth] = useState(() => createDefaultFestivalFilterState().viewMonth)
  const [filterRange, setFilterRange] = useState(() => createDefaultFestivalFilterState().range)
  const [mapReady, setMapReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<number | null>(null)
  const [aiRecommendations, setAiRecommendations] = useState<AiRecommendationsResponse | null>(null)
  const [aiRecommendationPinId, setAiRecommendationPinId] = useState<string | null>(null)
  const [aiRecommendationLoading, setAiRecommendationLoading] = useState(false)
  const [aiRecommendationError, setAiRecommendationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mapLanHintDismissed, setMapLanHintDismissed] = useState(false)
  const [mapNaverAuthFailed, setMapNaverAuthFailed] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  /** 모달에서 확정한 출발지·시작일 */
  const [confirmedItineraryBasics, setConfirmedItineraryBasics] = useState<ItineraryScheduleConfirmPayload | null>(null)
  const [itineraryRoute, setItineraryRoute] = useState<ItineraryRouteResult | null>(null)
  const [itineraryRouteLoading, setItineraryRouteLoading] = useState(false)
  const [itineraryRouteError, setItineraryRouteError] = useState<string | null>(null)
  const [scheduleSaveBusy, setScheduleSaveBusy] = useState(false)
  const [scheduleSaveFeedback, setScheduleSaveFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [scheduleConfirmDoneOpen, setScheduleConfirmDoneOpen] = useState(false)
  /** 일정 경로가 있을 때 정보 요약 핀을 지도에 다시 표시 */
  const [itinerarySummaryPinsOn, setItinerarySummaryPinsOn] = useState(false)
  const [itineraryNarrative, setItineraryNarrative] = useState(emptyCollabItineraryNarrative)

  const stopDayIndices = useMemo(() => {
    if (!itineraryRoute?.stops?.length) return [] as number[]
    const raw = computeStopDayIndicesFromCart(cartDays, tripHotelId)
    return itineraryRoute.stops.map((_, i) => raw[i] ?? 0)
  }, [cartDays, itineraryRoute, tripHotelId])

  const itineraryPolylinesRef = useRef<Array<{ setMap: (m: NaverMapInstance | null) => void }>>([])
  const itineraryMarkersRef = useRef<NaverMarkerInstance[]>([])
  /** 장바구니 순서만 바뀔 때는 fitBounds 생략(줌·팬 유지). 경로·일차 필터가 바뀔 때만 맞춤. */
  const itineraryFitBoundsKeyRef = useRef<string | null>(null)
  const [itineraryMapDay, setItineraryMapDay] = useState<number | 'all'>('all')
  /** 일정이 열려 있을 때 왼쪽 패널: 상세 정보 ↔ 일정 */
  const [scheduleSideTab, setScheduleSideTab] = useState<'detail' | 'itinerary'>('itinerary')

  const selectedAiRecommendations =
    selectedPin && aiRecommendationPinId === selectedPin.id ? aiRecommendations : null
  const filterRangeLabel = useMemo(
    () => formatFilterRangeLabel(filterRange.from, filterRange.to),
    [filterRange],
  )
  const filterCalendarCells = useMemo(
    () => buildMapCalendarCells(FILTER_YEAR, filterViewMonth),
    [filterViewMonth],
  )
  const cartPins = useMemo(() => cartDays.flat(), [cartDays])
  const hasCartContent = cartPins.length > 0

  const mapLanAuthHint = useMemo(() => {
    if (typeof window === 'undefined') return null
    return buildNcpMapLanAuthHint(window.location.origin, window.location.hostname)
  }, [])

  const ncpWebUrlPatterns = useMemo(() => {
    if (typeof window === 'undefined') return [] as string[]
    return ncpWebUrlPatternsForOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    if (!tripHotelId) return
    if (!cartPins.some((p) => p.id === tripHotelId)) setTripHotelId(null)
  }, [cartPins, tripHotelId])

  /** 로컬 저장 장바구니 등: 숙소가 한 일차에만 있을 때(이전 버전) 최초 한 번만 전 일차 맨 끝으로 맞춤 */
  const hotelTailSyncMigrated = useRef(false)
  useEffect(() => {
    if (hotelTailSyncMigrated.current) return
    hotelTailSyncMigrated.current = true
    if (tripHotelId != null) return
    const days = cartDays
    if (days.length < 2) return
    for (let d = 0; d < days.length; d++) {
      const day = days[d]
      const last = day[day.length - 1]
      if (!last || !isHotelPin(last)) continue
      if (!isHotelLastOnAllDays(days, last.id)) {
        setTripHotelId(last.id)
        setCartDays(appendHotelLastEveryDay(days, last, null))
        return
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 초기 장바구니 스냅샷만 검사
  }, [])

  const filteredSummaryPins = useMemo(() => {
    if (selectedCategories.includes('전체')) return summaryPins
    return summaryPins.filter((pin) => selectedCategories.includes(categoryForPin(pin)))
  }, [selectedCategories, summaryPins])

  function readAuthToken() {
    return typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
  }

  const collabSessionId = useMemo(() => {
    return new URLSearchParams(location.search).get('session')
  }, [location.search])

  const itineraryPayload = useMemo(
    (): CollabItineraryPayload => ({
      basics: confirmedItineraryBasics,
      route: itineraryRoute,
      narrative: itineraryNarrative,
      itineraryMapDay,
      itinerarySummaryPinsOn,
      itineraryLoading: itineraryRouteLoading,
      itineraryError: itineraryRouteError,
    }),
    [
      confirmedItineraryBasics,
      itineraryRoute,
      itineraryNarrative,
      itineraryMapDay,
      itinerarySummaryPinsOn,
      itineraryRouteLoading,
      itineraryRouteError,
    ],
  )

  function applyRemoteItinerary(raw: unknown) {
    const payload = raw as CollabItineraryPayload
    setConfirmedItineraryBasics(payload.basics)
    setItineraryRoute(payload.route)
    setItineraryNarrative(payload.narrative)
    setItineraryMapDay(payload.itineraryMapDay)
    setItinerarySummaryPinsOn(payload.itinerarySummaryPinsOn)
    setItineraryRouteLoading(payload.itineraryLoading)
    setItineraryRouteError(payload.itineraryError)
    if (!payload.route) {
      setScheduleSideTab('itinerary')
      setScheduleSaveFeedback(null)
    }
  }

  const collab = useCollabSession({
    sessionId: collabSessionId,
    enabled: Boolean(collabSessionId && readAuthToken()),
    mapReady,
    mapRef,
    mapElementRef,
    getNaverMaps,
    cartDays,
    tripHotelId,
    setCartDays,
    setTripHotelId,
    itineraryPayload,
    onApplyRemoteItinerary: applyRemoteItinerary,
  })

  const collabManageItinerary = !collabSessionId || collab.isHost

  function requireLogin() {
    const next = `${location.pathname}${location.search}`
    nav(`/login?next=${encodeURIComponent(next)}`)
  }

  useEffect(() => {
    const sp = new URLSearchParams(location.search)
    const sessionId = sp.get('session')
    if (!sessionId) return
    const authToken = localStorage.getItem('pintravel_token')
    if (!authToken) requireLogin()
  }, [location.pathname, location.search])

  useEffect(() => {
    if (collabSessionId) return
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartDays))
  }, [cartDays, collabSessionId])

  useEffect(() => {
    if (!selectedPin || !itineraryRoute || !confirmedItineraryBasics) return
    setScheduleSideTab('detail')
  }, [selectedPin?.id])

  useEffect(() => {
    const ac = new AbortController()
    fetchMapSummaryPins(
      {
        kind: 'all',
        region: 'busan',
        limit: 100,
        ...(festivalFilterEnabled ? filterRange : {}),
      },
      ac.signal,
    )
      .then((r) => {
        if (!ac.signal.aborted) setSummaryPins(r.pins)
      })
      .catch(() => {
        if (!ac.signal.aborted) setError('지도 핀 정보를 불러오지 못했어요.')
      })
    return () => ac.abort()
  }, [festivalFilterEnabled, filterRange])

  useEffect(() => {
    const maps = getNaverMaps()
    const map = mapRef.current
    if (!mapReady || !maps || !map) return

    const sp = new URLSearchParams(location.search)
    const latRaw = sp.get('lat')
    const lngRaw = sp.get('lng')
    const contentId = sp.get('contentId')
    const lat = latRaw ? Number(latRaw) : null
    const lng = lngRaw ? Number(lngRaw) : null

    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setCenter(new maps.LatLng(lat, lng))
      map.setZoom?.(16)
    }

    if (contentId) {
      const match = summaryPins.find((p) => p.kind === 'festival' && p.contentId === contentId)
      if (match) setSelectedPin(match)
    }
  }, [location.search, mapReady, summaryPins])

  useEffect(() => {
    function onToggleFilter() {
      setCalendarOpen((open) => !open)
    }

    window.addEventListener('pintravel:toggle-festival-filter', onToggleFilter)
    return () => window.removeEventListener('pintravel:toggle-festival-filter', onToggleFilter)
  }, [])

  function shiftFilterViewMonth(delta: number) {
    setFilterViewMonth((month) => {
      const next = month + delta
      if (next < 1) return 12
      if (next > 12) return 1
      return next
    })
  }

  function resetFestivalFilter() {
    const { viewMonth, range } = createDefaultFestivalFilterState()
    setFestivalFilterEnabled(false)
    setFilterViewMonth(viewMonth)
    setFilterRange(range)
  }

  function onDateClick(date: string) {
    setFestivalFilterEnabled(true)
    setFilterRange((range) => {
      if (range.from !== range.to) return { from: date, to: date }
      return date < range.from ? { from: date, to: range.from } : { from: range.from, to: date }
    })
  }

  function toggleCategory(category: MapCategory) {
    setSelectedCategories((selected) => {
      if (category === '전체') return ['전체']
      const withoutAll = selected.filter((item) => item !== '전체')
      const next = withoutAll.includes(category)
        ? withoutAll.filter((item) => item !== category)
        : [...withoutAll, category]
      return next.length > 0 ? next : ['전체']
    })
  }

  useEffect(() => {
    const pin = selectedPin
    if (!pin) return
    const { lat, lng } = pin.location
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    void loadAiRecommendations(pin)
    // loadAiRecommendations는 항상 동일 동작; selectedPin.id만으로 재요청 여부 결정
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedPin.id
  }, [selectedPin?.id])

  async function loadAiRecommendations(pin: SummaryPin) {
    setAiRecommendationLoading(true)
    setAiRecommendationError(null)
    setAiRecommendationPinId(pin.id)
    try {
      const recommendations = await fetchNearbyAiRecommendations({
        lat: pin.location.lat,
        lng: pin.location.lng,
        limit: 3,
      })
      setAiRecommendations(recommendations)
    } catch {
      setAiRecommendations(null)
      setAiRecommendationError('주변 식당/숙소 추천을 불러오지 못했어요.')
    } finally {
      setAiRecommendationLoading(false)
    }
  }

  function addSelectedPinToCart() {
    const pin = selectedPin
    if (!pin) return
    if (!readAuthToken()) {
      requireLogin()
      return
    }
    if (isHotelPin(pin)) {
      const prevHotelId = tripHotelId && tripHotelId !== pin.id ? tripHotelId : null
      setCartDays((days) => {
        if (isHotelLastOnAllDays(days, pin.id)) return days
        return appendHotelLastEveryDay(days, pin, prevHotelId)
      })
      setTripHotelId(pin.id)
    } else {
      setCartDays((days) => {
        if (days.some((day) => day.some((cartPin) => cartPin.id === pin.id))) return days
        return days.map((day, index) => (index === activeCartDay ? [...day, pin] : day))
      })
    }
    setCartPanelOpen(true)
  }

  function renderPinAiRecommendSection() {
    const pin = selectedPin
    if (!pin) return null
    return (
      <section className="mapAiRecommendPanel" aria-label="AI 추천 식당 및 숙소">
        <h2>AI 추천(식당/숙소)</h2>
        <p className="mapAiRecommendHelp">장소를 담으면 반경 1km부터 최대 3km까지 가까운 순서로 추천해요.</p>

        {aiRecommendationLoading && aiRecommendationPinId === pin.id ? (
          <div className="mapAiRecommendState">주변 추천을 불러오는 중이에요.</div>
        ) : null}
        {aiRecommendationError && aiRecommendationPinId === pin.id ? (
          <div className="mapAiRecommendError">{aiRecommendationError}</div>
        ) : null}

        {selectedAiRecommendations ? (
          <>
            <div className="mapAiRecommendGroup">
              <h3>주변 식당 추천</h3>
              {selectedAiRecommendations.food.items.length ? (
                selectedAiRecommendations.food.items.map((item, index) => (
                  <article key={`food:${item.contentId}`} className="mapAiRecommendItem">
                    <div className="mapAiRecommendThumb">
                      {item.image ? <img src={item.image} alt="" /> : <div className="thumbFallback" />}
                    </div>
                    <div className="mapAiRecommendBody">
                      <div className="mapAiRecommendTitleRow">
                        <span className="mapAiRecommendBadge mapAiRecommendBadge--food">식당 {index + 1}</span>
                        <div className="mapAiRecommendTitle">{item.title}</div>
                      </div>
                      <div className="mapAiRecommendMeta">{formatDistance(item.distanceMeters)}</div>
                      <div className="mapAiRecommendDesc">{recommendationAddressText(item)}</div>
                      <button
                        className="mapAiRecommendAddBtn"
                        type="button"
                        disabled={!item.location || cartPins.some((p) => p.id === `recommendation:food:${item.contentId}`)}
                        onClick={() => addRecommendationToCart(item, 'food')}
                      >
                        {cartPins.some((p) => p.id === `recommendation:food:${item.contentId}`)
                          ? '담긴 장소'
                          : '장소 담기'}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="mapAiRecommendState">3km 안에 추천할 식당이 없어요.</div>
              )}
            </div>

            <div className="mapAiRecommendGroup">
              <h3>주변 숙소 추천</h3>
              {selectedAiRecommendations.hotel.items.length ? (
                selectedAiRecommendations.hotel.items.map((item, index) => (
                  <article key={`hotel:${item.contentId}`} className="mapAiRecommendItem">
                    <div className="mapAiRecommendThumb">
                      {item.image ? <img src={item.image} alt="" /> : <div className="thumbFallback" />}
                    </div>
                    <div className="mapAiRecommendBody">
                      <div className="mapAiRecommendTitleRow">
                        <span className="mapAiRecommendBadge mapAiRecommendBadge--hotel">숙소 {index + 1}</span>
                        <div className="mapAiRecommendTitle">{item.title}</div>
                      </div>
                      <div className="mapAiRecommendMeta">{formatDistance(item.distanceMeters)}</div>
                      <div className="mapAiRecommendDesc">{recommendationAddressText(item)}</div>
                      <button
                        className="mapAiRecommendAddBtn"
                        type="button"
                        disabled={!item.location || cartPins.some((p) => p.id === `recommendation:hotel:${item.contentId}`)}
                        onClick={() => addRecommendationToCart(item, 'hotel')}
                      >
                        {cartPins.some((p) => p.id === `recommendation:hotel:${item.contentId}`)
                          ? '담긴 장소'
                          : '장소 담기'}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="mapAiRecommendState">3km 안에 추천할 숙소가 없어요.</div>
              )}
            </div>
          </>
        ) : !aiRecommendationLoading ? (
          <div className="mapAiRecommendState">장소 담기 버튼을 누르면 주변 추천이 표시돼요.</div>
        ) : null}
      </section>
    )
  }

  function renderSelectedPinDetailBlocks() {
    const pin = selectedPin
    if (!pin) return null
    return (
      <>
        <div className="mapDetailHero">
          {detailImageUrl(pin) ? (
            <img src={detailImageUrl(pin) ?? ''} alt={pin.title} />
          ) : (
            <img className="mapDetailFallbackIcon" src={iconUrlForPin(pin)} alt="" />
          )}
        </div>
        <div className="mapDetailBody">
          <h1>{pin.title}</h1>
          <dl className="mapDetailInfo">
            <div>
              <dt>주소</dt>
              <dd>{addressText(pin)}</dd>
            </div>
            {pin.zipcode ? (
              <div>
                <dt>우편</dt>
                <dd>{pin.zipcode}</dd>
              </div>
            ) : null}
            <div>
              <dt>{pin.kind === 'festival' ? '장소' : '주차'}</dt>
              <dd>{placeLabel(pin)}</dd>
            </div>
            <div>
              <dt>{pin.kind === 'festival' ? '기간' : '운영'}</dt>
              <dd>{summaryDateRange(pin)}</dd>
            </div>
            {pin.kind === 'tour' ? (
              <div>
                <dt>휴무</dt>
                <dd>{compactText(pin.summary.restDate, '휴무 정보 없음')}</dd>
              </div>
            ) : null}
            <div>
              <dt>요금</dt>
              <dd>{compactText(pin.summary.fee, '요금 정보 없음')}</dd>
            </div>
            <div>
              <dt>문의</dt>
              <dd>{contactText(pin)}</dd>
            </div>
          </dl>
          <p className="mapDetailOverview">{overviewText(pin)}</p>
          <button type="button" onClick={addSelectedPinToCart}>
            {cartPins.some((p) => p.id === pin.id) ? '담긴 장소' : '장소 담기'}
          </button>
          {renderPinAiRecommendSection()}
        </div>
      </>
    )
  }

  function addRecommendationToCart(item: AiRecommendationItem, kind: 'food' | 'hotel') {
    if (!readAuthToken()) {
      requireLogin()
      return
    }

    const pin = recommendationToCartPin(item, kind)
    if (!pin) return

    if (kind === 'hotel') {
      const prevHotelId = tripHotelId && tripHotelId !== pin.id ? tripHotelId : null
      setCartDays((days) => {
        if (isHotelLastOnAllDays(days, pin.id)) return days
        return appendHotelLastEveryDay(days, pin, prevHotelId)
      })
      setTripHotelId(pin.id)
    } else {
      setCartDays((days) => {
        if (days.some((day) => day.some((cartPin) => cartPin.id === pin.id))) return days
        return days.map((day, index) => (index === activeCartDay ? [...day, pin] : day))
      })
    }
    setCartPanelOpen(true)
  }

  function removePinFromCart(dayIndex: number, pinId: string) {
    setCartDays((days) => days.map((day, index) => (index === dayIndex ? day.filter((pin) => pin.id !== pinId) : day)))
  }

  function addCartDay() {
    const nextDayIndex = cartDays.length
    const hid = tripHotelId
    setCartDays((days) => {
      const next = [...days, []]
      const lastIdx = next.length - 1
      if (hid) {
        const hotel = days.flat().find((p) => p.id === hid)
        if (hotel) next[lastIdx] = [hotel]
      }
      return next
    })
    setActiveCartDay(nextDayIndex)
  }

  function removeCartDay(dayIndex: number) {
    if (dayIndex === 0) return
    setCartDays((days) => days.filter((_, index) => index !== dayIndex))
    setActiveCartDay((activeDay) => {
      if (activeDay === dayIndex) return Math.max(0, dayIndex - 1)
      if (activeDay > dayIndex) return activeDay - 1
      return activeDay
    })
  }

  function moveCartPin(targetDayIndex: number, targetPinId?: string) {
    if (!draggingPin) return

    setCartDays((days) => {
      const sourceDay = days[draggingPin.dayIndex] ?? []
      const movingPin = sourceDay.find((pin) => pin.id === draggingPin.pinId)
      if (!movingPin) return days

      const withoutMovingPin = days.map((day) => day.filter((pin) => pin.id !== draggingPin.pinId))
      const targetDay = [...(withoutMovingPin[targetDayIndex] ?? [])]
      const insertIndex = targetPinId ? targetDay.findIndex((pin) => pin.id === targetPinId) : targetDay.length
      targetDay.splice(insertIndex >= 0 ? insertIndex : targetDay.length, 0, movingPin)

      return withoutMovingPin.map((day, index) => (index === targetDayIndex ? targetDay : day))
    })
    setActiveCartDay(targetDayIndex)
    setDraggingPin(null)
  }

  function clearItineraryRoute() {
    if (collabSessionId && !collab.isHost) return
    applyRemoteItinerary(emptyCollabItinerary())
  }

  async function fetchItineraryRouteForDeparture(departure: string) {
    const pins = flattenCartPinsWithLocation(cartDays, tripHotelId)
    if (pins.length === 0) {
      setItineraryRouteError('좌표가 있는 장소가 장바구니에 없어요.')
      return
    }

    const stops: ItineraryRouteStopInput[] = pins.map((p) => ({
      lat: p.location.lat,
      lng: p.location.lng,
      title: compactText(p.title, '이름 없음'),
      contentId: p.contentId,
      fee: p.summary?.fee ?? null,
      time: p.summary?.time ?? p.summary?.restDate ?? null,
      kind: p.kind,
    }))

    setItineraryRouteError(null)
    setItineraryRouteLoading(true)
    try {
      const route = await postItineraryRoute({ departureQuery: departure, stops })
      setItineraryRoute(route)
      setScheduleSaveFeedback(null)
      setSelectedPin(null)
    } catch (err) {
      const code = err instanceof Error ? err.message : 'ROUTE_FAILED'
      const cause =
        err instanceof Error ? (err as Error & { cause?: Record<string, unknown> }).cause : undefined
      let message = itineraryRouteErrorMessage(code)
      if (code === 'GEOCODE_NOT_FOUND' && cause && typeof cause === 'object') {
        message += formatItineraryGeocodeDebug(cause as Record<string, unknown>)
      }
      setItineraryRouteError(message)
    } finally {
      setItineraryRouteLoading(false)
    }
  }

  async function handleItineraryScheduleConfirm(payload: ItineraryScheduleConfirmPayload) {
    if (collabSessionId && !collab.isHost) return
    setScheduleModalOpen(false)
    setConfirmedItineraryBasics(payload)
    setItineraryRoute(null)
    setItineraryRouteError(null)
    setItineraryMapDay('all')
    setItinerarySummaryPinsOn(false)

    await fetchItineraryRouteForDeparture(payload.departure)
  }

  function handleCartItineraryPrimaryClick() {
    if (collabSessionId && !collab.isHost) return
    if (itineraryRoute && confirmedItineraryBasics) {
      void fetchItineraryRouteForDeparture(confirmedItineraryBasics.departure)
      return
    }
    setScheduleModalOpen(true)
  }

  async function handleConfirmScheduleClick() {
    if (collabSessionId && !collab.isHost) return
    if (!itineraryRoute || !confirmedItineraryBasics) return
    const authToken = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
    if (!authToken) {
      requireLogin()
      return
    }
    setScheduleSaveFeedback(null)
    setScheduleSaveBusy(true)
    try {
      await postScheduleConfirm({
        region: SCHEDULE_DEFAULT_REGION,
        collabSessionId,
        tripStartDate: confirmedItineraryBasics.tripStartDate,
        departure: confirmedItineraryBasics.departure,
        tripHotelId,
        visitDays: buildVisitDaysFromCart(cartDays, confirmedItineraryBasics.tripStartDate),
        ...buildRouteCompactForSchedule(itineraryRoute),
      })
      setScheduleSaveFeedback({ kind: 'ok', text: '일정이 저장되었어요.' })
      setScheduleConfirmDoneOpen(true)
    } catch (err) {
      const code = err instanceof Error ? err.message : 'FAILED'
      if (code === 'UNAUTHORIZED') requireLogin()
      else setScheduleSaveFeedback({ kind: 'error', text: '일정 저장에 실패했어요. 잠시 후 다시 시도해 주세요.' })
    } finally {
      setScheduleSaveBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    loadNaverMapScript(() => setMapNaverAuthFailed(true))
      .then(() => {
        const maps = getNaverMaps()
        if (cancelled || !mapElementRef.current || !maps) return
        const center = new maps.LatLng(BUSAN_CENTER.lat, BUSAN_CENTER.lng)
        mapRef.current = new maps.Map(mapElementRef.current, { center, zoom: 12 })
        setMapReady(true)
      })
      .catch(() => {
        if (!cancelled) setError('네이버 지도를 불러오지 못했어요.')
      })

    return () => {
      cancelled = true
      const maps = getNaverMaps()
      if (maps) {
        mapListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
        markerListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
        mapListenersRef.current = []
        markerListenersRef.current = []
      }
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
      recommendationMarkersRef.current.forEach((marker) => marker.setMap(null))
      recommendationMarkersRef.current = []
      recommendationMarkerListenersRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!mapReady || !mapElementRef.current) return
    const el = mapElementRef.current
    const detect = () => {
      const t = el.textContent ?? ''
      if (t.includes('인증이 실패') || t.includes('Open API 인증')) setMapNaverAuthFailed(true)
    }
    detect()
    const id = window.setInterval(detect, 600)
    const stop = window.setTimeout(() => window.clearInterval(id), 8000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(stop)
    }
  }, [mapReady])

  useEffect(() => {
    const mapsMaybe = getNaverMaps()
    const mapMaybe = mapRef.current
    if (!mapReady || !mapsMaybe || !mapMaybe) return
    const maps = mapsMaybe
    const mapInstance = mapMaybe

    function clearMarkers() {
      markerListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
      markerListenersRef.current = []
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
    }

    function visiblePins() {
      const bounds = mapInstance.getBounds()
      return filteredSummaryPins.filter((pin) => bounds.hasLatLng(new maps.LatLng(pin.location.lat, pin.location.lng)))
    }

    function renderMarkers() {
      clearMarkers()
      const zoom = mapInstance.getZoom()
      setZoomLevel(zoom)
      console.log('[PinTravel map] zoom level:', zoom)
      /** 기본: 경로·번호 마커만. 장소 핀 ON이면 요약 핀·클러스터도 표시 */
      if (
        itineraryRoute != null &&
        itineraryRoute.path.length > 0 &&
        !itinerarySummaryPinsOn
      ) {
        return
      }

      const pinsInView = visiblePins()
      if (pinsInView.length === 0) return

      if (zoom >= CLUSTER_UNLOCK_ZOOM) {
        spreadPinsForDisplay(pinsInView).forEach(({ pin, location }) => {
          const marker = new maps.Marker({
            position: new maps.LatLng(location.lat, location.lng),
            map: mapInstance,
            icon: {
              content: createSummaryPinContent(pin),
              size: new maps.Size(226, 125),
              anchor: new maps.Point(113, 125),
            },
          })
          markersRef.current.push(marker)
          markerListenersRef.current.push(maps.Event.addListener(marker, 'click', () => setSelectedPin(pin)))
        })
        return
      }

      const clusters = clusterPinsByZoom(pinsInView, zoom)
      clusters.forEach((cluster) => {
        if (cluster.pins.length > 1 || zoom < CLUSTER_UNLOCK_ZOOM) {
          const count = cluster.pins.length
          if (count === 1 && zoom > SINGLE_CLUSTER_MAX_ZOOM) {
            const pin = cluster.pins[0]
            const marker = new maps.Marker({
              position: new maps.LatLng(pin.location.lat, pin.location.lng),
              map: mapInstance,
              icon: {
                content: createSummaryPinContent(pin),
                size: new maps.Size(226, 125),
                anchor: new maps.Point(113, 125),
              },
            })
            markersRef.current.push(marker)
            markerListenersRef.current.push(maps.Event.addListener(marker, 'click', () => setSelectedPin(pin)))
            return
          }

          const clusterSize = count >= 100 ? 52 : count >= 10 ? 48 : 44
          const clusterAnchor = clusterSize / 2
          markersRef.current.push(
            new maps.Marker({
              position: new maps.LatLng(cluster.location.lat, cluster.location.lng),
              map: mapInstance,
              icon: {
                content: createClusterPinContent(count, clusterSize),
                size: new maps.Size(clusterSize, clusterSize),
                anchor: new maps.Point(clusterAnchor, clusterAnchor),
              },
            }),
          )
          return
        }

        const pin = cluster.pins[0]
        const marker = new maps.Marker({
          position: new maps.LatLng(pin.location.lat, pin.location.lng),
          map: mapInstance,
          icon: {
            content: createSummaryPinContent(pin),
            size: new maps.Size(226, 125),
            anchor: new maps.Point(113, 125),
          },
        })
        markersRef.current.push(marker)
        markerListenersRef.current.push(maps.Event.addListener(marker, 'click', () => setSelectedPin(pin)))
      })
    }

    mapListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
    mapListenersRef.current = [
      maps.Event.addListener(mapInstance, 'zoom_changed', renderMarkers),
      maps.Event.addListener(mapInstance, 'dragend', renderMarkers),
      maps.Event.addListener(mapInstance, 'idle', renderMarkers),
    ]
    renderMarkers()

    return () => {
      mapListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
      markerListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
      recommendationMarkerListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
      mapListenersRef.current = []
      markerListenersRef.current = []
      recommendationMarkerListenersRef.current = []
      clearMarkers()
    }
  }, [filteredSummaryPins, mapReady, itineraryRoute, itinerarySummaryPinsOn])

  useEffect(() => {
    const maps = getNaverMaps()
    const map = mapRef.current
    if (!mapReady || !maps || !map) return
    const naverMaps = maps
    const mapInstance = map

    function clearRecommendationMarkers() {
      recommendationMarkerListenersRef.current.forEach((listener) => naverMaps.Event.removeListener(listener))
      recommendationMarkerListenersRef.current = []
      recommendationMarkersRef.current.forEach((marker) => marker.setMap(null))
      recommendationMarkersRef.current = []
    }

    clearRecommendationMarkers()

    if (!selectedAiRecommendations) return clearRecommendationMarkers

    const addRecommendationMarker = (item: AiRecommendationItem, kind: 'food' | 'hotel', index: number) => {
      if (!item.location) return
      const marker = new naverMaps.Marker({
        position: new naverMaps.LatLng(item.location.lat, item.location.lng),
        map: mapInstance,
        zIndex: 1000,
        icon: {
          content: createRecommendationMarkerHtml(kind, index),
          size: new naverMaps.Size(34, 34),
          anchor: new naverMaps.Point(17, 34),
        },
      })
      recommendationMarkersRef.current.push(marker)
      recommendationMarkerListenersRef.current.push(
        naverMaps.Event.addListener(marker, 'click', () =>
          mapInstance.setCenter(new naverMaps.LatLng(item.location!.lat, item.location!.lng)),
        ),
      )
    }

    selectedAiRecommendations.food.items.forEach((item, index) => addRecommendationMarker(item, 'food', index + 1))
    selectedAiRecommendations.hotel.items.forEach((item, index) => addRecommendationMarker(item, 'hotel', index + 1))

    return clearRecommendationMarkers
  }, [mapReady, selectedAiRecommendations])

  useEffect(() => {
    const maps = getNaverMaps() as unknown as {
      LatLng: new (lat: number, lng: number) => NaverLatLng
      Point: new (x: number, y: number) => NaverPoint
      Size: new (w: number, h: number) => NaverSize
      Polyline: new (opts: {
        map: NaverMapInstance
        path: NaverLatLng[]
        strokeColor?: string
        strokeWeight?: number
        strokeOpacity?: number
        strokeStyle?: string
        strokeLineCap?: string
        strokeLineJoin?: string
      }) => { setMap: (m: NaverMapInstance | null) => void }
      LatLngBounds: new () => { extend: (ll: NaverLatLng) => void }
      Marker: new (options: {
        position: NaverLatLng
        map: NaverMapInstance
        icon?: { content: string; size: NaverSize; anchor: NaverPoint }
      }) => NaverMarkerInstance
    }
    const map = mapRef.current
    if (!mapReady || !maps || !map) return

    itineraryPolylinesRef.current.forEach((p) => p.setMap(null))
    itineraryPolylinesRef.current = []
    itineraryMarkersRef.current.forEach((m) => m.setMap(null))
    itineraryMarkersRef.current = []

    if (!itineraryRoute?.path?.length) {
      itineraryFitBoundsKeyRef.current = null
      return
    }

    const route = itineraryRoute
    const nStops = route.stops.length
    const stopDay =
      stopDayIndices.length === nStops ? stopDayIndices : route.stops.map((_, i) => stopDayIndices[i] ?? 0)

    const legPathsRaw = route.legPaths
    const legsOk =
      Array.isArray(legPathsRaw) && legPathsRaw.length === route.legs.length && route.legs.length > 0

    const boundsPaths: NaverLatLng[][] = []
    const pushPolyline = (pathPts: NaverLatLng[], strokeColor: string) => {
      if (pathPts.length < 2) return
      boundsPaths.push(pathPts)
      const pl = new maps.Polyline({
        map,
        path: pathPts,
        strokeColor,
        strokeOpacity: 0.9,
        strokeWeight: 5,
        strokeStyle: 'shortdash',
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
      })
      itineraryPolylinesRef.current.push(pl)
    }

    if (!legsOk) {
      if (itineraryMapDay === 'all') {
        const pathPts = route.path.map((p) => new maps.LatLng(p.lat, p.lng))
        pushPolyline(pathPts, '#111827')
      }
    } else if (itineraryMapDay === 'all') {
      for (let j = 0; j < legPathsRaw.length; j++) {
        const seg = legPathsRaw[j] ?? []
        const pathPts = seg.map((p) => new maps.LatLng(p.lat, p.lng))
        const color = itineraryDayColor(stopDay[j] ?? 0)
        pushPolyline(pathPts, color)
      }
    } else {
      const D = itineraryMapDay
      const idx = legIndicesForStopDay(stopDay, D)
      const segs = idx.map((j) => legPathsRaw[j] ?? []).filter((s) => s.length > 0)
      const merged = concatPathSegments(
        segs.map((seg) => seg.map((p) => ({ lat: p.lat, lng: p.lng }))),
      )
      const pathPts = merged.map((p) => new maps.LatLng(p.lat, p.lng))
      pushPolyline(pathPts, itineraryDayColor(D))
    }

    const dep = route.departure
    const markerPositions: NaverLatLng[] = []

    const pushMarker = (ll: NaverLatLng, html: string) => {
      markerPositions.push(ll)
      itineraryMarkersRef.current.push(
        new maps.Marker({
          position: ll,
          map,
          icon: {
            content: html,
            size: new maps.Size(32, 32),
            anchor: new maps.Point(16, 16),
          },
        }),
      )
    }

    if (!legsOk || itineraryMapDay === 'all') {
      pushMarker(new maps.LatLng(dep.lat, dep.lng), createItineraryDepartureMarkerHtml())
      route.stops.forEach((s) => {
        const d = stopDay[s.order - 1] ?? 0
        pushMarker(
          new maps.LatLng(s.lat, s.lng),
          createItineraryStopMarkerHtml(s.order, legsOk ? d : undefined, cartDays, tripHotelId),
        )
      })
    } else {
      const D = itineraryMapDay
      const firstIdx = legIndicesForStopDay(stopDay, D)[0]
      if (firstIdx === 0) {
        pushMarker(new maps.LatLng(dep.lat, dep.lng), createItineraryDepartureMarkerHtml())
      }
      route.stops.forEach((s) => {
        const d = stopDay[s.order - 1] ?? 0
        if (d !== D) return
        pushMarker(new maps.LatLng(s.lat, s.lng), createItineraryStopMarkerHtml(s.order, D, cartDays, tripHotelId))
      })
    }

    const bounds = new maps.LatLngBounds()
    boundsPaths.flat().forEach((ll) => bounds.extend(ll))
    markerPositions.forEach((ll) => bounds.extend(ll))
    const fit = (map as NaverMapInstance & { fitBounds?: (b: unknown) => void }).fitBounds

    const path0 = route.path[0]
    const pathN = route.path[route.path.length - 1]
    const fitKey = [
      route.path.length,
      route.totalDistanceM,
      route.totalDurationMs,
      route.legs.length,
      path0?.lat,
      path0?.lng,
      pathN?.lat,
      pathN?.lng,
      itineraryMapDay,
    ].join('|')
    const shouldFitBounds = itineraryFitBoundsKeyRef.current !== fitKey
    if (shouldFitBounds) itineraryFitBoundsKeyRef.current = fitKey

    if (
      shouldFitBounds &&
      (boundsPaths.length > 0 || markerPositions.length > 0)
    ) {
      if (typeof fit === 'function') {
        fit.call(map, bounds)
      } else if (boundsPaths[0]?.[0]) {
        map.setCenter(boundsPaths[0][Math.floor(boundsPaths[0].length / 2)])
        map.setZoom?.(12)
      } else if (markerPositions[0]) {
        map.setCenter(markerPositions[0])
        map.setZoom?.(12)
      }
    }

    return () => {
      itineraryPolylinesRef.current.forEach((p) => p.setMap(null))
      itineraryPolylinesRef.current = []
      itineraryMarkersRef.current.forEach((m) => m.setMap(null))
      itineraryMarkersRef.current = []
    }
  }, [itineraryRoute, mapReady, itineraryMapDay, stopDayIndices, cartDays, tripHotelId])

  const showMapLanBanner = !mapLanHintDismissed && (mapLanAuthHint != null || mapNaverAuthFailed)

  return (
    <section className="mapPage">
      <div className="mapPageMapStack">
        <div ref={mapElementRef} className="mapCanvas" />
        <SessionCursorOverlay cursors={collab.remoteCursors} />
      </div>

      {collabSessionId ? (
        <div
          className={`mapCollabBadge ${collab.connected ? 'mapCollabBadge--on' : ''}`}
          role="status"
        >
          {collab.connected
            ? collab.isHost
              ? '협업 세션 · 호스트(지도·커서 공유 중)'
              : '협업 세션 · 게스트(호스트 화면 동기화 · 직접 이동 불가)'
            : '협업 세션 연결 중…'}
        </div>
      ) : null}

      {collab.sessionError ? (
        <div className="mapCollabError" role="alert">
          {collab.sessionError}
        </div>
      ) : null}

      {showMapLanBanner ? (
        <aside className="mapLanAuthBanner" role="alert">
          <p className="mapLanAuthBannerTitle">네이버 지도 인증 (LAN 접속)</p>
          <p className="mapLanAuthBannerBody">
            NCP <strong>Maps Application</strong> → 서비스 환경 → Web 서비스 URL에 아래 주소를{' '}
            <strong>경로·별표(`/*`) 없이</strong> 넣고 저장하세요. 브라우저 주소창과 완전히 같아야 합니다.
          </p>
          <ul className="mapLanAuthBannerUrls">
            {ncpWebUrlPatterns.map((url) => (
              <li key={url}>
                <code>{url}</code>
              </li>
            ))}
          </ul>
          <p className="mapLanAuthBannerMeta">
            Client ID 앞 4자리: <code>{NAVER_MAP_KEY_ID ? String(NAVER_MAP_KEY_ID).slice(0, 4) : '—'}…</code>
            (콘솔 Application의 Client ID와 같아야 함)
          </p>
          <div className="mapLanAuthBannerActions">
            <button type="button" onClick={() => void copyTextToClipboard(ncpWebUrlPatterns.join('\n'))}>
              URL 복사
            </button>
            <button type="button" onClick={() => setMapLanHintDismissed(true)}>
              닫기
            </button>
          </div>
        </aside>
      ) : null}

      <div className="mapFilterChips" aria-label="카테고리 및 장소 핀">
        <div className="mapFilterChipsInner">
          {MAP_FILTERS.map((filter) => (
            <button
              key={filter}
              className={`mapChip ${selectedCategories.includes(filter) ? 'mapChip--selected' : ''}`}
              type="button"
              style={
                selectedCategories.includes(filter) ? MAP_CHIP_SELECTED_STYLE[filter] : undefined
              }
              onClick={() => toggleCategory(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        {itineraryRoute != null && itineraryRoute.path.length > 0 ? (
          <button
            type="button"
            className={`mapPinToggle ${itinerarySummaryPinsOn ? 'mapPinToggle--on' : ''}`}
            aria-pressed={itinerarySummaryPinsOn}
            aria-label="정보 요약 장소 핀 표시"
            title={collabManageItinerary ? '일정을 보면서 장소를 고르거나 장바구니를 수정할 수 있어요' : '호스트 화면과 동일하게 표시돼요'}
            disabled={Boolean(collabSessionId && !collab.isHost)}
            onClick={() => {
              if (collabSessionId && !collab.isHost) return
              setItinerarySummaryPinsOn((v) => {
                const next = !v
                if (!next) setSelectedPin(null)
                return next
              })
            }}
          >
            장소 핀 {itinerarySummaryPinsOn ? 'ON' : 'OFF'}
          </button>
        ) : null}
      </div>

      {calendarOpen ? (
        <aside className="mapDateCard" aria-label="날짜 필터">
          <div className={`mapDateStatus ${festivalFilterEnabled ? 'active' : ''}`}>
            {festivalFilterEnabled ? `필터 적용: ${filterRangeLabel}` : '기간을 선택하면 필터가 적용돼요'}
          </div>
          <div className="mapDateHeader">
            <button type="button" aria-label="이전 달" onClick={() => shiftFilterViewMonth(-1)}>
              ‹
            </button>
            <select
              aria-label="월"
              value={String(filterViewMonth)}
              onChange={(e) => setFilterViewMonth(Number(e.target.value))}
            >
              {MAP_FILTER_MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}월
                </option>
              ))}
            </select>
            <select aria-label="연도" value={String(FILTER_YEAR)} onChange={() => undefined}>
              <option value={FILTER_YEAR}>{FILTER_YEAR}</option>
            </select>
            <button type="button" aria-label="다음 달" onClick={() => shiftFilterViewMonth(1)}>
              ›
            </button>
          </div>
          <div className="mapMiniCalendar">
            {MAP_CALENDAR_DOW.map((day) => (
              <span key={day} className="mutedDay">
                {day}
              </span>
            ))}
            {filterCalendarCells.map((cell) => {
              const active = Boolean(
                cell.inMonth && festivalFilterEnabled && cell.date >= filterRange.from && cell.date <= filterRange.to,
              )
              return (
                <button
                  key={cell.date}
                  className={`${active ? 'selectedDay' : ''} ${cell.inMonth ? '' : 'mutedCalendarDay'}`.trim()}
                  type="button"
                  disabled={!cell.inMonth}
                  onClick={() => cell.inMonth && onDateClick(cell.date)}
                >
                  {cell.day}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="mapDateResetBtn"
            aria-label="축제 날짜 필터 초기화"
            onClick={resetFestivalFilter}
          >
            초기화
          </button>
        </aside>
      ) : null}

      <div className="mapZoomBadge" aria-live="polite">
        줌 레벨: {zoomLevel ?? '-'}
      </div>

      {selectedPin && !itineraryRoute ? (
        <aside className="mapDetailPanel" aria-label="상세 정보">
          <button className="mapDetailTab" type="button">
            상세 정보
          </button>
          {renderSelectedPinDetailBlocks()}
        </aside>
      ) : null}

      {itineraryRoute && confirmedItineraryBasics ? (
        <aside className="mapSideTabPanel" aria-label="일정 및 장소 정보">
          <div className="mapSideTabPanelHeader">
            <span className="mapSideTabPanelHeaderSpacer" />
            {collabManageItinerary ? (
              <button type="button" className="mapItineraryClose" aria-label="일정 패널 닫기" onClick={clearItineraryRoute}>
                ×
              </button>
            ) : (
              <span className="mapSideTabPanelHeaderSpacer" />
            )}
          </div>
          <div className="mapSideTabBar" role="tablist" aria-label="보기 전환">
            <button
              type="button"
              role="tab"
              aria-selected={scheduleSideTab === 'detail'}
              className={`mapSideTab ${scheduleSideTab === 'detail' ? 'mapSideTab--active' : ''}`}
              onClick={() => setScheduleSideTab('detail')}
            >
              상세 정보
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scheduleSideTab === 'itinerary'}
              className={`mapSideTab ${scheduleSideTab === 'itinerary' ? 'mapSideTab--active' : ''}`}
              onClick={() => setScheduleSideTab('itinerary')}
            >
              일정
            </button>
          </div>
          <div className="mapSideTabPanelScroll">
            {scheduleSideTab === 'detail' ? (
              selectedPin ? (
                renderSelectedPinDetailBlocks()
              ) : (
                <div className="mapSideTabEmpty">
                  상단에서 <strong>장소 핀 ON</strong> 후 지도에서 핀을 누르면 여기에 상세 정보가 표시돼요.
                </div>
              )
            ) : (
              <ItineraryRoutePanel
                embedded
                tripStartDate={confirmedItineraryBasics.tripStartDate}
                route={itineraryRoute}
                cartDays={cartDays}
                tripHotelId={tripHotelId}
                selectedMapItineraryDay={itineraryMapDay}
                onSelectMapItineraryDay={setItineraryMapDay}
                onClose={clearItineraryRoute}
                narrativeFromHost={itineraryNarrative}
                narrativeReadonly={Boolean(collabSessionId && !collab.isHost)}
                onNarrativeChange={collabManageItinerary ? setItineraryNarrative : undefined}
                viewControlsReadonly={Boolean(collabSessionId && !collab.isHost)}
              />
            )}
          </div>
        </aside>
      ) : null}

      {hasCartContent && !cartPanelOpen ? (
        <button className="mapCartOpenTab" type="button" onClick={() => setCartPanelOpen(true)}>
          장바구니 열기
        </button>
      ) : null}

      {hasCartContent && cartPanelOpen ? (
        <aside className="mapCartPanel" aria-label="여행 일정 장바구니">
          <button className="mapCartBack" type="button" aria-label="장바구니 패널 접기" onClick={() => setCartPanelOpen(false)}>
            ←
          </button>

          {cartDays.map((dayPins, dayIndex) => (
            <section key={dayIndex} className={`mapCartDay ${dayIndex === activeCartDay ? 'active' : ''}`}>
              <div className="mapCartDayHeader">
                <button className="mapCartDayLabel" type="button" onClick={() => setActiveCartDay(dayIndex)}>
                  {dayIndex + 1}DAY
                </button>
                {dayIndex > 0 ? (
                  <button className="mapCartRemoveDay" type="button" aria-label={`${dayIndex + 1}DAY 삭제`} onClick={() => removeCartDay(dayIndex)}>
                    ×
                  </button>
                ) : null}
              </div>
              <div
                className="mapCartList"
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => moveCartPin(dayIndex)}
              >
                {dayPins.length === 0 ? <div className="mapCartEmpty">이 날짜에 담을 장소를 선택하세요.</div> : null}
                {dayPins.map((pin) => (
                  <article
                    key={pin.id}
                    className={`mapCartItem ${draggingPin?.pinId === pin.id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDraggingPin({ dayIndex, pinId: pin.id })}
                    onDragEnd={() => setDraggingPin(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.stopPropagation()
                      moveCartPin(dayIndex, pin.id)
                    }}
                  >
                    <div className="mapCartThumb">
                      {detailImageUrl(pin) ? (
                        <img src={detailImageUrl(pin) ?? ''} alt="" />
                      ) : (
                        <img className="mapCartFallbackIcon" src={iconUrlForPin(pin)} alt="" />
                      )}
                    </div>
                    <div className="mapCartTitle">{pin.title}</div>
                    <button type="button" aria-label={`${pin.title} 삭제`} onClick={() => removePinFromCart(dayIndex, pin.id)}>
                      ×
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}

          <button className="mapCartAddDay" type="button" aria-label="일정 일차 추가" onClick={addCartDay}>
            +
          </button>

          <div className="mapCartFooterBtns">
            {itineraryRoute && confirmedItineraryBasics ? (
              <>
                <button
                  className="mapCartRegenerateBtn"
                  type="button"
                  disabled={!collabManageItinerary || itineraryRouteLoading || scheduleSaveBusy}
                  aria-label="수정된 장바구니로 일정 경로 다시 계산"
                  title={
                    collabManageItinerary
                      ? '장바구니 변경을 반영해 경로를 다시 계산해요'
                      : '호스트만 일정을 다시 생성할 수 있어요'
                  }
                  onClick={handleCartItineraryPrimaryClick}
                >
                  재생성
                </button>
                <button
                  className="mapCartConfirmBtn"
                  type="button"
                  disabled={!collabManageItinerary || itineraryRouteLoading || scheduleSaveBusy}
                  aria-label="확정 일정을 서버에 저장"
                  title={collabManageItinerary ? undefined : '호스트만 일정을 확정할 수 있어요'}
                  onClick={() => void handleConfirmScheduleClick()}
                >
                  일정 확정
                </button>
              </>
            ) : (
              <button
                className="mapCartCreateBtn"
                type="button"
                disabled={!collabManageItinerary || itineraryRouteLoading}
                aria-label="출발지와 시작일을 입력해 일정 생성"
                title={collabManageItinerary ? undefined : '호스트만 일정을 생성할 수 있어요'}
                onClick={handleCartItineraryPrimaryClick}
              >
                일정 생성
              </button>
            )}
          </div>
          {scheduleSaveFeedback ? (
            <p
              className={`mapCartSaveHint ${scheduleSaveFeedback.kind === 'error' ? 'mapCartSaveHintError' : ''}`}
              role="status"
            >
              {scheduleSaveFeedback.text}
            </p>
          ) : null}
        </aside>
      ) : null}

      <ItineraryScheduleModal
        open={scheduleModalOpen}
        defaultTripStartDate={filterRange.from}
        onClose={() => setScheduleModalOpen(false)}
        onConfirm={handleItineraryScheduleConfirm}
      />

      {scheduleConfirmDoneOpen ? (
        <div className="itineraryModalRoot">
          <div className="itineraryModalBackdrop" aria-hidden="true" />
          <div className="itineraryConfirmDoneModal" role="dialog" aria-modal="true" aria-labelledby="schedule-confirm-done-title">
            <div className="itineraryConfirmDoneIcon" aria-hidden="true">
              ✓
            </div>
            <h2 id="schedule-confirm-done-title" className="itineraryModalTitle">
              일정 확정 완료
            </h2>
            <p className="itineraryConfirmDoneText">
              일정이 확정되었습니다. 확정된 일정은 마이페이지에 기록됩니다.
            </p>
            <div className="itineraryModalFooter">
              <button
                type="button"
                className="itineraryModalBtn itineraryModalBtnPrimary"
                onClick={() => setScheduleConfirmDoneOpen(false)}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {itineraryRouteLoading ? (
        <div className="mapItineraryLoading" role="status">
          {collabSessionId && !collab.isHost ? '호스트가 경로를 계산하는 중이에요…' : '경로를 계산하는 중이에요…'}
        </div>
      ) : null}

      {itineraryRouteError ? (
        <div className="mapItineraryError" role="alert">
          <span className="mapItineraryErrorText">{itineraryRouteError}</span>
          <button type="button" className="mapItineraryErrorDismiss" onClick={() => setItineraryRouteError(null)}>
            닫기
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mapPageError" role="status">
          {error}
        </div>
      ) : null}
    </section>
  )
}
