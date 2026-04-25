import { useEffect, useMemo, useRef, useState } from 'react'

import festivalIconUrl from '../assets/festival.png'
import naturalIconUrl from '../assets/natural.png'
import palaceIconUrl from '../assets/palace.png'
import pinTemplateUrl from '../assets/pin.png'
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
const CLUSTER_UNLOCK_ZOOM = 17
const NAVER_MAP_SCRIPT_ID = 'naver-map-script'
const NAVER_MAP_KEY_ID = import.meta.env.VITE_X_NCP_APIGW_API_KEY_ID
const FILTER_YEAR = 2026
const FILTER_MONTH = 4
const FILTER_DAYS = 30

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

function iconUrlForPin(pin: SummaryPin) {
  if (pin.iconType === 'festival') return festivalIconUrl
  if (pin.iconType === 'palace') return palaceIconUrl
  return naturalIconUrl
}

function createSummaryPinContent(pin: SummaryPin) {
  const title = escapeHtml(compactText(pin.title, '이름 없음'))
  const fee = escapeHtml(compactText(pin.summary.fee, '요금 정보 없음'))
  const dateRange = escapeHtml(summaryDateRange(pin))
  const iconUrl = escapeHtml(iconUrlForPin(pin))
  const pinUrl = escapeHtml(pinTemplateUrl)

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

const FILTERS = ['전체', '역사/문화', '축제', '시장/쇼핑', '전시/문화시설', '자연/공원'] as const

export function MapPage() {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const markersRef = useRef<NaverMarkerInstance[]>([])
  const mapListenersRef = useRef<NaverEventListener[]>([])
  const markerListenersRef = useRef<NaverEventListener[]>([])
  const [summaryPins, setSummaryPins] = useState<SummaryPin[]>([])
  const [selectedPin, setSelectedPin] = useState<SummaryPin | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [festivalFilterEnabled, setFestivalFilterEnabled] = useState(false)
  const [filterRange, setFilterRange] = useState({ from: toIsoDate(1), to: toIsoDate(FILTER_DAYS) })
  const [mapReady, setMapReady] = useState(false)
  const [zoomLevel, setZoomLevel] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedRange = useMemo(() => (selectedPin ? summaryDateRange(selectedPin) : null), [selectedPin])
  const filterRangeLabel = useMemo(() => rangeLabel(filterRange.from, filterRange.to), [filterRange])

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
      return summaryPins.filter((pin) => bounds.hasLatLng(new maps.LatLng(pin.location.lat, pin.location.lng)))
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
  }, [summaryPins, mapReady])

  return (
    <section className="mapPage">
      <div ref={mapElementRef} className="mapCanvas" />

      <div className="mapFilterChips" aria-label="카테고리 필터">
        {FILTERS.map((filter) => (
          <button key={filter} className={`mapChip ${filter === '전체' ? 'active' : ''}`} type="button">
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
            {selectedPin.image ? (
              <img src={selectedPin.image} alt={selectedPin.title} />
            ) : (
              <img className="mapDetailFallbackIcon" src={iconUrlForPin(selectedPin)} alt="" />
            )}
          </div>
          <div className="mapDetailBody">
            <h1>{selectedPin.title}</h1>
            <p>주소: {addressText(selectedPin)}</p>
            <p>요금: {compactText(selectedPin.summary.fee, '요금 정보 없음')}</p>
            <p>기간: {selectedRange}</p>
            <p>좌표: {selectedPin.location.lat.toFixed(5)}, {selectedPin.location.lng.toFixed(5)}</p>
            <button type="button" onClick={() => setSelectedPin(null)}>
              장소 닫기
            </button>
          </div>
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
