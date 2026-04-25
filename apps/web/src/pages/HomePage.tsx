import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import festivalIconUrl from '../assets/festival.png'
import naturalIconUrl from '../assets/natural.png'
import palaceIconUrl from '../assets/palace.png'
import pinTemplateUrl from '../assets/pin.png'
import { fetchMainFestivals, fetchMapSummaryPins, type FestivalListItem, type SummaryPin } from '../lib/api'

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
    addListener(target: NaverMapInstance, eventName: string, listener: () => void): NaverEventListener
    removeListener(listener: NaverEventListener): void
  }
}

declare global {
  interface Window {
    naver?: {
      maps: NaverMaps
    }
  }
}

const BUSAN_CENTER = { lat: 35.1796, lng: 129.0756 }
const SINGLE_CLUSTER_MAX_ZOOM = 12
const SUMMARY_PIN_MAX_CLUSTER_ZOOM = 16
const NAVER_MAP_SCRIPT_ID = 'naver-map-script'
const NAVER_MAP_KEY_ID = import.meta.env.VITE_X_NCP_APIGW_API_KEY_ID

let naverMapScriptPromise: Promise<void> | null = null

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function todayIsoDate() {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function formatDate(date: string) {
  const [, month, day] = date.split('-').map(Number)
  return `${month}월 ${day}일`
}

function formatDateRange(startDate: string, endDate: string) {
  const [startYear] = startDate.split('-')
  return `${startYear}년 ${formatDate(startDate)} ~ ${formatDate(endDate)}`
}

function formatPinDate(date: string | null | undefined) {
  if (!date) return null
  const [year, month, day] = date.split('-')
  return `${year}.${month}.${day}`
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

function iconUrlForPin(pin: SummaryPin) {
  if (pin.iconType === 'festival') return festivalIconUrl
  if (pin.iconType === 'palace') return palaceIconUrl
  return naturalIconUrl
}

function compactText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.replace(/\s+/g, ' ').trim()
  return trimmed || fallback
}

function summaryLineForPin(pin: SummaryPin) {
  if (pin.kind === 'festival') {
    if (pin.summary.startDate && pin.summary.endDate) {
      return `${formatPinDate(pin.summary.startDate)}~${formatPinDate(pin.summary.endDate)}`
    }
    return '기간 정보 없음'
  }

  return compactText(pin.summary.time ?? pin.summary.restDate, '관광지 정보 확인')
}

function createSummaryPinContent(pin: SummaryPin) {
  const title = escapeHtml(compactText(pin.title, '이름 없음'))
  const fee = escapeHtml(compactText(pin.summary.fee, '요금 정보 없음'))
  const summary = escapeHtml(summaryLineForPin(pin))
  const iconUrl = escapeHtml(iconUrlForPin(pin))
  const pinUrl = escapeHtml(pinTemplateUrl)

  return `
    <div class="summaryPinMarker" style="background-image: url('${pinUrl}')">
      <img class="summaryPinIcon" src="${iconUrl}" alt="" />
      <div class="summaryPinText">
        <div class="summaryPinTitle">${title}</div>
        <div class="summaryPinLine">${fee}</div>
        <div class="summaryPinLine">${summary}</div>
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
  if (zoom <= 13) return 0.08
  if (zoom === 14) return 0.04
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

function loadNaverMapScript() {
  if (window.naver?.maps) return Promise.resolve()
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

export function HomePage() {
  const today = useMemo(() => todayIsoDate(), [])
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<NaverMapInstance | null>(null)
  const markersRef = useRef<NaverMarkerInstance[]>([])
  const mapListenersRef = useRef<NaverEventListener[]>([])
  const [festivals, setFestivals] = useState<FestivalListItem[]>([])
  const [summaryPins, setSummaryPins] = useState<SummaryPin[]>([])
  const [loadingFestivals, setLoadingFestivals] = useState(true)
  const [festivalError, setFestivalError] = useState<string | null>(null)
  const [mapError, setMapError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    const ac = new AbortController()
    fetchMainFestivals({ date: today, limit: 6 }, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setFestivals(r.festivals)
      })
      .catch(() => {
        if (!ac.signal.aborted) setFestivalError('진행 중인 축제를 불러오지 못했어요.')
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoadingFestivals(false)
      })
    return () => ac.abort()
  }, [today])

  useEffect(() => {
    const ac = new AbortController()
    fetchMapSummaryPins({ kind: 'festival', region: 'busan', limit: 60 }, ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) setSummaryPins(r.pins)
      })
      .catch(() => {
        if (!ac.signal.aborted) setMapError('지도 핀 정보를 불러오지 못했어요.')
      })
    return () => ac.abort()
  }, [])

  useEffect(() => {
    let cancelled = false

    loadNaverMapScript()
      .then(() => {
        if (cancelled || !mapElementRef.current || !window.naver?.maps) return
        const naverMaps = window.naver.maps
        const center = new naverMaps.LatLng(BUSAN_CENTER.lat, BUSAN_CENTER.lng)
        mapRef.current = new naverMaps.Map(mapElementRef.current, { center, zoom: 12 })
        setMapReady(true)
      })
      .catch(() => {
        if (!cancelled) setMapError('네이버 지도를 불러오지 못했어요.')
      })

    return () => {
      cancelled = true
      if (window.naver?.maps) {
        mapListenersRef.current.forEach((listener) => window.naver?.maps.Event.removeListener(listener))
        mapListenersRef.current = []
      }
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
    }
  }, [])

  useEffect(() => {
    const naverMaps = window.naver?.maps
    const map = mapRef.current
    if (!mapReady || !naverMaps || !map) return
    const maps = naverMaps
    const mapInstance = map

    function clearMarkers() {
      markersRef.current.forEach((marker) => marker.setMap(null))
      markersRef.current = []
    }

    function visiblePins() {
      const bounds = mapInstance.getBounds()
      return summaryPins.filter((pin) => bounds.hasLatLng(new maps.LatLng(pin.location.lat, pin.location.lng)))
    }

    function renderMarkers() {
      clearMarkers()
      const pinsInView = visiblePins()
      if (pinsInView.length === 0) return
      const zoom = mapInstance.getZoom()
      const clusters = clusterPinsByZoom(pinsInView, zoom)

      clusters.forEach((cluster) => {
        if (cluster.pins.length > 1 || zoom <= SUMMARY_PIN_MAX_CLUSTER_ZOOM) {
          const count = cluster.pins.length
          if (count === 1 && zoom > SINGLE_CLUSTER_MAX_ZOOM) {
            const pin = cluster.pins[0]
            markersRef.current.push(
              new maps.Marker({
                position: new maps.LatLng(pin.location.lat, pin.location.lng),
                map: mapInstance,
                icon: {
                  content: createSummaryPinContent(pin),
                  size: new maps.Size(226, 125),
                  anchor: new maps.Point(113, 125),
                },
              }),
            )
            return
          }

          const clusterLocation = cluster.location
          const clusterSize = count >= 100 ? 52 : count >= 10 ? 48 : 44
          const clusterAnchor = clusterSize / 2
          markersRef.current.push(
            new maps.Marker({
              position: new maps.LatLng(clusterLocation.lat, clusterLocation.lng),
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
        markersRef.current.push(
          new maps.Marker({
            position: new maps.LatLng(pin.location.lat, pin.location.lng),
            map: mapInstance,
            icon: {
              content: createSummaryPinContent(pin),
              size: new maps.Size(226, 125),
              anchor: new maps.Point(113, 125),
            },
          }),
        )
      })
    }

    renderMarkers()
    mapListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
    mapListenersRef.current = [
      maps.Event.addListener(mapInstance, 'zoom_changed', renderMarkers),
      maps.Event.addListener(mapInstance, 'dragend', renderMarkers),
      maps.Event.addListener(mapInstance, 'idle', renderMarkers),
    ]

    return () => {
      mapListenersRef.current.forEach((listener) => maps.Event.removeListener(listener))
      mapListenersRef.current = []
      clearMarkers()
    }
  }, [summaryPins, mapReady])

  return (
    <section className="page homePage">
      <div className="homeLayout">
        <section className="homeFestivalPanel" aria-label="오늘 진행 중인 축제">
          {festivalError ? <div className="error">{festivalError}</div> : null}

          {loadingFestivals ? (
            <div className="homeState">진행 중인 축제를 불러오는 중이에요.</div>
          ) : festivals.length === 0 ? (
            <div className="homeState">오늘 진행 중인 축제가 없어요.</div>
          ) : (
            <div className="homeFestivalList">
              {festivals.map((festival) => (
                <article key={festival.contentId} className="homeFestivalCard">
                  <div className="homeFestivalThumb">
                    {festival.image ? <img src={festival.image} alt="" loading="lazy" /> : <div className="thumbFallback" />}
                  </div>
                  <div className="homeFestivalBody">
                    <h2 className="homeFestivalTitle">{festival.title}</h2>
                    <div className="homeFestivalInfo">
                      <span aria-hidden="true">⌖</span>
                      <span>{festival.address?.addr1 ?? festival.eventPlace ?? '장소 정보 없음'}</span>
                    </div>
                    <div className="homeFestivalInfo">
                      <span aria-hidden="true">□</span>
                      <span>{formatDateRange(festival.startDate, festival.endDate)}</span>
                    </div>
                    {festival.overview ? <p className="homeFestivalDesc">{festival.overview}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          )}

          <Link className="homeMoreLink" to="/calendar">
            더보기
          </Link>
        </section>

        <section className="homeMapPanel" aria-label="지도">
          <div ref={mapElementRef} className="homeNaverMap" />
          {mapError ? (
            <div className="homeMapError" role="status">
              {mapError}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  )
}
