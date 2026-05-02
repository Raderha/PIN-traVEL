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
import { fetchMapSummaryPins, type SummaryPin } from '../lib/api'

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
  getZoom(): number
  getBounds(): NaverLatLngBounds
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
const FILTER_MONTH = 4
const FILTER_DAYS = 30
const CART_STORAGE_KEY = 'pintravel_map_cart_days'

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

function toIsoDate(day: number) {
  return `${FILTER_YEAR}-${String(FILTER_MONTH).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function dayFromIsoDate(date: string) {
  return Number(date.split('-')[2])
}

function rangeLabel(from: string, to: string) {
  return `${FILTER_MONTH}월 ${dayFromIsoDate(from)}일 ~ ${FILTER_MONTH}월 ${dayFromIsoDate(to)}일`
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

function loadNaverMapScript() {
  if (getNaverMaps()) return Promise.resolve()
  if (!NAVER_MAP_KEY_ID) return Promise.reject(new Error('MISSING_NAVER_MAP_KEY'))
  if (naverMapScriptPromise) return naverMapScriptPromise

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

export function MapPage() {
  const location = useLocation()
  const nav = useNavigate()
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const markersRef = useRef<NaverMarkerInstance[]>([])
  const mapListenersRef = useRef<NaverEventListener[]>([])
  const markerListenersRef = useRef<NaverEventListener[]>([])
  const [summaryPins, setSummaryPins] = useState<SummaryPin[]>([])
  const [selectedPin, setSelectedPin] = useState<SummaryPin | null>(null)
  const [cartDays, setCartDays] = useState<SummaryPin[][]>(() => loadStoredCartDays())
  const [activeCartDay, setActiveCartDay] = useState(0)
  const [draggingPin, setDraggingPin] = useState<{ dayIndex: number; pinId: string } | null>(null)
  const [selectedCategories, setSelectedCategories] = useState<MapCategory[]>(['전체'])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [festivalFilterEnabled, setFestivalFilterEnabled] = useState(false)
  const [filterRange, setFilterRange] = useState({ from: toIsoDate(1), to: toIsoDate(FILTER_DAYS) })
  const [mapReady, setMapReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedRange = useMemo(() => (selectedPin ? summaryDateRange(selectedPin) : null), [selectedPin])
  const filterRangeLabel = useMemo(() => rangeLabel(filterRange.from, filterRange.to), [filterRange])
  const cartPins = useMemo(() => cartDays.flat(), [cartDays])
  const hasCartContent = cartPins.length > 0
  const filteredSummaryPins = useMemo(() => {
    if (selectedCategories.includes('전체')) return summaryPins
    return summaryPins.filter((pin) => selectedCategories.includes(categoryForPin(pin)))
  }, [selectedCategories, summaryPins])
  const itineraryDraft = useMemo(
    () => ({
      days: cartDays.map((pins, dayIndex) => ({
        day: dayIndex + 1,
        items: pins.map((pin, order) => ({
          order,
          id: pin.id,
          contentId: pin.contentId,
          kind: pin.kind,
          title: pin.title,
        })),
      })),
    }),
    [cartDays],
  )

  const token = useMemo(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
  }, [])

  function requireLogin() {
    const next = `${location.pathname}${location.search}`
    nav(`/login?next=${encodeURIComponent(next)}`)
  }

  useEffect(() => {
    const sp = new URLSearchParams(location.search)
    const session = sp.get('session')
    if (session && !token) requireLogin()
  }, [location.search, token])

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartDays))
  }, [cartDays])

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

  function onDateClick(day: number) {
    const date = toIsoDate(day)
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

  function addSelectedPinToCart() {
    if (!selectedPin) return
    if (!token) {
      requireLogin()
      return
    }
    setCartDays((days) => {
      if (days.some((day) => day.some((pin) => pin.id === selectedPin.id))) return days
      return days.map((day, index) => (index === activeCartDay ? [...day, selectedPin] : day))
    })
  }

  function removePinFromCart(dayIndex: number, pinId: string) {
    setCartDays((days) => days.map((day, index) => (index === dayIndex ? day.filter((pin) => pin.id !== pinId) : day)))
  }

  function addCartDay() {
    const nextDayIndex = cartDays.length
    setCartDays((days) => [...days, []])
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

  useEffect(() => {
    let cancelled = false

    loadNaverMapScript()
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
    }
  }, [])

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
      mapListenersRef.current = []
      markerListenersRef.current = []
      clearMarkers()
    }
  }, [filteredSummaryPins, mapReady])

  return (
    <section className="mapPage">
      <div ref={mapElementRef} className="mapCanvas" />

      <div className="mapFilterChips" aria-label="카테고리 필터">
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

      {calendarOpen ? (
        <aside className="mapDateCard" aria-label="날짜 필터">
          <div className={`mapDateStatus ${festivalFilterEnabled ? 'active' : ''}`}>
            {festivalFilterEnabled ? `필터 적용: ${filterRangeLabel}` : '기간을 선택하면 필터가 적용돼요'}
          </div>
          <div className="mapDateHeader">
            <button type="button" aria-label="이전 달">
              ‹
            </button>
            <select aria-label="월" value="Apr" onChange={() => undefined}>
              <option>Apr</option>
            </select>
            <select aria-label="연도" value={String(FILTER_YEAR)} onChange={() => undefined}>
              <option>{FILTER_YEAR}</option>
            </select>
            <button type="button" aria-label="다음 달">
              ›
            </button>
          </div>
          <div className="mapMiniCalendar">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <span key={day} className="mutedDay">
                {day}
              </span>
            ))}
            {Array.from({ length: 35 }, (_, idx) => {
              const day = idx + 1
              const date = day <= FILTER_DAYS ? toIsoDate(day) : null
              const active = Boolean(date && festivalFilterEnabled && date >= filterRange.from && date <= filterRange.to)
              return (
                <button
                  key={day}
                  className={active ? 'selectedDay' : ''}
                  type="button"
                  disabled={!date}
                  onClick={() => date && onDateClick(day)}
                >
                  {day <= 30 ? day : ''}
                </button>
              )
            })}
          </div>
        </aside>
      ) : null}

      <div className="mapZoomBadge" aria-live="polite">
        줌 레벨: {zoomLevel ?? '-'}
      </div>

      {selectedPin ? (
        <aside className="mapDetailPanel" aria-label="상세 정보">
          <button className="mapDetailTab" type="button">
            상세 정보
          </button>
          <div className="mapDetailHero">
            {detailImageUrl(selectedPin) ? (
              <img src={detailImageUrl(selectedPin) ?? ''} alt={selectedPin.title} />
            ) : (
              <img className="mapDetailFallbackIcon" src={iconUrlForPin(selectedPin)} alt="" />
            )}
          </div>
          <div className="mapDetailBody">
            <h1>{selectedPin.title}</h1>
            <dl className="mapDetailInfo">
              <div>
                <dt>주소</dt>
                <dd>{addressText(selectedPin)}</dd>
              </div>
              {selectedPin.zipcode ? (
                <div>
                  <dt>우편</dt>
                  <dd>{selectedPin.zipcode}</dd>
                </div>
              ) : null}
              <div>
                <dt>{selectedPin.kind === 'festival' ? '장소' : '주차'}</dt>
                <dd>{placeLabel(selectedPin)}</dd>
              </div>
              <div>
                <dt>{selectedPin.kind === 'festival' ? '기간' : '운영'}</dt>
                <dd>{selectedRange}</dd>
              </div>
              {selectedPin.kind === 'tour' ? (
                <div>
                  <dt>휴무</dt>
                  <dd>{compactText(selectedPin.summary.restDate, '휴무 정보 없음')}</dd>
                </div>
              ) : null}
              <div>
                <dt>요금</dt>
                <dd>{compactText(selectedPin.summary.fee, '요금 정보 없음')}</dd>
              </div>
              <div>
                <dt>문의</dt>
                <dd>{contactText(selectedPin)}</dd>
              </div>
            </dl>
            <p className="mapDetailOverview">{overviewText(selectedPin)}</p>
            <button type="button" onClick={addSelectedPinToCart}>
              {cartPins.some((pin) => pin.id === selectedPin.id) ? '담긴 장소' : '장소 담기'}
            </button>
          </div>
        </aside>
      ) : null}

      {hasCartContent ? (
        <aside className="mapCartPanel" aria-label="여행 일정 장바구니">
          <div className="mapCartBack" aria-hidden="true">
            ←
          </div>

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

          <button className="mapCartCreateBtn" type="button" onClick={() => console.log('[PinTravel itinerary draft]', itineraryDraft)}>
            일정 생성
          </button>
        </aside>
      ) : null}

      {error ? (
        <div className="mapPageError" role="status">
          {error}
        </div>
      ) : null}
    </section>
  )
}
