import { useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { io, type Socket } from 'socket.io-client'

import { fetchSession, type CollabSessionState, type SummaryPin } from '../lib/api'
import { normalizeCollabCartPayload } from '../lib/collabCart'
import { emptyCollabItinerary, normalizeCollabItineraryPayload, type CollabItineraryPayload } from '../lib/collabItinerary'

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const CURSOR_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777']
function colorForName(username: string) {
  let h = 0
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) | 0
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length]
}

export type RemoteCursor = {
  username: string
  lat: number
  lng: number
}

type MapView = { center: { lat: number; lng: number }; zoom: number }

type NaverMapLike = {
  setCenter(position: unknown): void
  setZoom?(zoom: number): void
  getZoom(): number
  getCenter?: () => unknown
  setOptions?: (opts: Record<string, unknown>) => void
  morph?: (center: unknown, zoom: number) => void
}

type UseCollabSessionParams = {
  sessionId: string | null
  enabled: boolean
  mapReady: boolean
  mapRef: RefObject<NaverMapLike | null>
  mapElementRef: RefObject<HTMLElement | null>
  getNaverMaps: () =>
    | {
        LatLng: new (lat: number, lng: number) => unknown
        Point?: new (x: number, y: number) => unknown
        Marker?: new (options: {
          position: unknown
          map: unknown
          zIndex?: number
          icon?: { content: string; size?: unknown; anchor?: unknown }
        }) => unknown
        Event?: {
          addListener: (t: unknown, e: string, fn: (ev?: unknown) => void) => unknown
          removeListener: (l: unknown) => void
        }
      }
    | undefined
  /** true면 게스트 지도를 호스트 뷰로 강제 동기화 */
  syncHostMapView?: boolean
  cartDays: SummaryPin[][]
  tripHotelId: string | null
  setCartDays: Dispatch<SetStateAction<SummaryPin[][]>>
  setTripHotelId: Dispatch<SetStateAction<string | null>>
  itineraryPayload: CollabItineraryPayload
  onApplyRemoteItinerary: (raw: unknown) => void
}

function readUsername(): string {
  try {
    const raw = localStorage.getItem('pintravel_user')
    if (!raw) return `guest-${Math.random().toString(36).slice(2, 7)}`
    const u = JSON.parse(raw) as { username?: string }
    return u.username?.trim() || `guest-${Math.random().toString(36).slice(2, 7)}`
  } catch {
    return `guest-${Math.random().toString(36).slice(2, 7)}`
  }
}

function readUserId(): string | null {
  try {
    const raw = localStorage.getItem('pintravel_user')
    if (raw) {
      const u = JSON.parse(raw) as { id?: string }
      if (u.id) return u.id
    }
  } catch {
    /* ignore */
  }
  try {
    const token = localStorage.getItem('pintravel_token')
    if (!token) return null
    let b64 = token.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4
    if (pad) b64 += '='.repeat(4 - pad)
    const json = JSON.parse(atob(b64)) as { userId?: string }
    return json.userId ?? null
  } catch {
    return null
  }
}

function latLngToNumbers(center: unknown): { lat: number; lng: number } | null {
  if (center == null || typeof center !== 'object') return null
  const c = center as { lat?: number | (() => number); lng?: number | (() => number); y?: number; x?: number }
  const lat = typeof c.lat === 'function' ? c.lat() : typeof c.lat === 'number' ? c.lat : c.y
  const lng = typeof c.lng === 'function' ? c.lng() : typeof c.lng === 'number' ? c.lng : c.x
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

function readMapView(map: NaverMapLike): MapView | null {
  if (!map.getCenter) return null
  const center = latLngToNumbers(map.getCenter())
  if (!center) return null
  const zoom = map.getZoom()
  if (!Number.isFinite(zoom)) return null
  return { center, zoom }
}

function applyMapView(
  map: NaverMapLike,
  getNaverMaps: UseCollabSessionParams['getNaverMaps'],
  view: MapView,
) {
  const maps = getNaverMaps()
  if (!maps) return
  const latLng = new maps.LatLng(view.center.lat, view.center.lng)
  if (map.morph) {
    map.morph(latLng, view.zoom)
    return
  }
  map.setCenter(latLng)
  map.setZoom?.(view.zoom)
}

function setGuestMapInteraction(map: NaverMapLike, guest: boolean) {
  map.setOptions?.({
    draggable: !guest,
    pinchZoom: !guest,
    scrollWheel: !guest,
    keyboardShortcuts: !guest,
    disableDoubleClickZoom: guest,
    disableDoubleTapZoom: guest,
    disableTwoFingerTapZoom: guest,
  })
}

function stateMapView(state: CollabSessionState | null | undefined): MapView | null {
  const c = state?.map?.center
  const z = state?.map?.zoom
  if (!c || z == null || !Number.isFinite(z)) return null
  return { center: c, zoom: z }
}

export function useCollabSession({
  sessionId,
  enabled,
  mapReady,
  mapRef,
  mapElementRef,
  getNaverMaps,
  syncHostMapView = true,
  cartDays,
  tripHotelId,
  setCartDays,
  setTripHotelId,
  itineraryPayload,
  onApplyRemoteItinerary,
}: UseCollabSessionParams) {
  const [connected, setConnected] = useState(false)
  const [isHost, setIsHost] = useState(false)
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([])
  const [sessionError, setSessionError] = useState<string | null>(null)

  const socketRef = useRef<Socket | null>(null)
  const usernameRef = useRef(readUsername())
  const userIdRef = useRef(readUserId())
  const isHostRef = useRef(false)
  const applyingRemoteMapRef = useRef(false)
  const applyingRemoteCartRef = useRef(false)
  const applyingRemoteItineraryRef = useRef(false)
  const lastEmittedCartRef = useRef('')
  const lastEmittedItineraryRef = useRef('')
  const pendingGuestViewRef = useRef<MapView | null>(null)
  const lastCursorEmitRef = useRef(0)
  const collabMapListenersRef = useRef<Array<{ remove?: () => void }>>([])
  const cursorMarkersRef = useRef<Map<string, unknown>>(new Map())
  const cursorMarkerListenersRef = useRef<Array<{ remove?: () => void }>>([])

  const cartDaysRef = useRef(cartDays)
  const tripHotelIdRef = useRef(tripHotelId)
  const setCartDaysRef = useRef(setCartDays)
  const setTripHotelIdRef = useRef(setTripHotelId)
  const mapRefStable = useRef(mapRef)
  const getNaverMapsRef = useRef(getNaverMaps)
  const itineraryPayloadRef = useRef(itineraryPayload)
  const onApplyRemoteItineraryRef = useRef(onApplyRemoteItinerary)

  cartDaysRef.current = cartDays
  itineraryPayloadRef.current = itineraryPayload
  onApplyRemoteItineraryRef.current = onApplyRemoteItinerary
  tripHotelIdRef.current = tripHotelId
  setCartDaysRef.current = setCartDays
  setTripHotelIdRef.current = setTripHotelId
  mapRefStable.current = mapRef
  getNaverMapsRef.current = getNaverMaps

  const applyRemoteCartRef = useRef((raw: unknown) => {
    const payload = normalizeCollabCartPayload(raw)
    applyingRemoteCartRef.current = true
    lastEmittedCartRef.current = JSON.stringify(payload)
    setCartDaysRef.current(payload.cartDays.length > 0 ? payload.cartDays : [[]])
    setTripHotelIdRef.current(payload.tripHotelId)
    window.setTimeout(() => {
      applyingRemoteCartRef.current = false
    }, 80)
  })

  const applyRemoteItineraryRef = useRef((raw: unknown) => {
    applyingRemoteItineraryRef.current = true
    const payload = normalizeCollabItineraryPayload(raw)
    lastEmittedItineraryRef.current = JSON.stringify(payload)
    onApplyRemoteItineraryRef.current(payload)
    window.setTimeout(() => {
      applyingRemoteItineraryRef.current = false
    }, 80)
  })

  const emitItineraryNowRef = useRef(() => {
    if (!isHostRef.current || applyingRemoteItineraryRef.current) return false
    const payload = itineraryPayloadRef.current
    const hasItinerary = Boolean(payload.basics && payload.route)
    const wire = hasItinerary ? payload : null
    const serialized = JSON.stringify(wire)
    if (serialized === lastEmittedItineraryRef.current) return true
    if (!socketRef.current?.connected) return false
    lastEmittedItineraryRef.current = serialized
    socketRef.current.emit('session:itinerary', wire)
    return true
  })

  const emitCartNowRef = useRef(() => {
    if (applyingRemoteCartRef.current) return false
    const payload = { cartDays: cartDaysRef.current, tripHotelId: tripHotelIdRef.current ?? null }
    const serialized = JSON.stringify(payload)
    if (serialized === lastEmittedCartRef.current) return true
    if (!socketRef.current?.connected) return false
    lastEmittedCartRef.current = serialized
    socketRef.current.emit('session:cart', payload)
    return true
  })

  const applyGuestViewRef = useRef((view: MapView) => {
    const map = mapRefStable.current.current
    if (!map) {
      pendingGuestViewRef.current = view
      return
    }
    applyingRemoteMapRef.current = true
    applyMapView(map, getNaverMapsRef.current, view)
    window.setTimeout(() => {
      applyingRemoteMapRef.current = false
    }, 400)
  })

  const emitMapViewNowRef = useRef(() => {
    if (!isHostRef.current || applyingRemoteMapRef.current) return false
    const map = mapRefStable.current.current
    if (!map) return false
    const view = readMapView(map)
    if (!view || !socketRef.current?.connected) return false
    socketRef.current.emit('session:map', view)
    return true
  })

  useEffect(() => {
    usernameRef.current = readUsername()
    userIdRef.current = readUserId()
  }, [])

  useEffect(() => {
    if (!enabled || !sessionId) {
      setConnected(false)
      setIsHost(false)
      isHostRef.current = false
      setRemoteCursors([])
      return
    }

    let cancelled = false
    let socket: Socket | null = null

    const bootstrap = async () => {
      try {
        const r = await fetchSession(sessionId)
        if (cancelled) return

        const uid = userIdRef.current
        const host = Boolean(uid && uid === r.session.hostUserId)
        isHostRef.current = host
        setIsHost(host)

        socket = io(window.location.origin, {
          path: '/socket.io',
          transports: ['polling', 'websocket'],
          withCredentials: true,
        })
        socketRef.current = socket

        const joinSession = () => {
          if (cancelled) return
          setSessionError(null)
          socket!.emit('session:join', {
            sessionId,
            username: usernameRef.current,
            userId: userIdRef.current,
          })
        }

        const onSessionError = (payload: { sessionId?: string; error?: string }) => {
          if (cancelled || payload.sessionId !== sessionId) return
          setConnected(false)
          isHostRef.current = false
          setIsHost(false)
          if (payload.error === 'HOST_RECONNECT_NOT_ALLOWED') {
            setSessionError('호스트는 같은 세션에 다시 접속할 수 없어요. 새 협업 세션을 만들어 주세요.')
          } else if (payload.error === 'NOT_FOUND') {
            setSessionError(
              host
                ? '세션을 찾을 수 없어요. 새 협업 세션을 만들어 주세요.'
                : '세션이 종료됐거나 없어요. 호스트에게 새 초대 링크를 요청해 주세요.',
            )
          } else {
            setSessionError('세션에 참가하지 못했어요.')
          }
        }

        const onSessionEnded = (payload: { sessionId?: string }) => {
          if (cancelled || (payload.sessionId && payload.sessionId !== sessionId)) return
          setConnected(false)
          setRemoteCursors([])
          setSessionError('호스트가 세션을 종료했어요. 다시 참여하려면 호스트에게 새 초대 링크를 받아 주세요.')
        }

        const onSessionState = (payload: { sessionId?: string; state?: CollabSessionState }) => {
          if (cancelled || payload.sessionId !== sessionId) return
          setConnected(true)
          setSessionError(null)
          if (!isHostRef.current && syncHostMapView) {
            const view = stateMapView(payload.state)
            if (view) applyGuestViewRef.current(view)
          }
          if (!isHostRef.current) {
            if (payload.state?.cart) applyRemoteCartRef.current(payload.state.cart)
          }
          if (payload.state?.itinerary) {
            applyRemoteItineraryRef.current(payload.state.itinerary)
          } else if (!isHostRef.current) {
            applyRemoteItineraryRef.current(emptyCollabItinerary())
          }
        }

        const onSessionItinerary = (itinerary: unknown) => {
          if (cancelled || isHostRef.current) return
          applyRemoteItineraryRef.current(itinerary ?? emptyCollabItinerary())
        }

        const onSessionCart = (cart: unknown) => {
          if (cancelled) return
          applyRemoteCartRef.current(cart)
        }

        const onSessionMap = (payload: { center?: { lat: number; lng: number }; zoom?: number }) => {
          if (cancelled || isHostRef.current || !syncHostMapView) return
          if (!payload.center || payload.zoom == null) return
          applyGuestViewRef.current({ center: payload.center, zoom: payload.zoom })
        }

        const onSessionCursor = (payload: { username?: string; lat?: number; lng?: number }) => {
          if (cancelled) return
          const name = payload.username ?? 'guest'
          if (name === usernameRef.current) return
          if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return
          setRemoteCursors((prev) => {
            const next = prev.filter((c) => c.username !== name)
            next.push({ username: name, lat: payload.lat!, lng: payload.lng! })
            return next
          })

          // projection 없이도 확실히 보이도록: 지도 마커로 커서 표시
          try {
            const maps = getNaverMapsRef.current()
            const map = mapRefStable.current.current as unknown as { setCenter?: (p: unknown) => void } | null
            if (!maps?.Marker || !maps?.LatLng || !map) return
            const pos = new maps.LatLng(payload.lat!, payload.lng!)
            const existing = cursorMarkersRef.current.get(name) as any
            if (existing?.setPosition) {
              existing.setPosition(pos)
            } else {
              const marker = new maps.Marker({
                position: pos,
                map,
                zIndex: 10_000,
                icon: {
                  content: `<div class="collabCursorMarker" style="--cursor-color:${colorForName(name)}"><span class="dot"></span><span class="label">${escapeHtml(name)}</span></div>`,
                },
              }) as any
              cursorMarkersRef.current.set(name, marker)
            }
          } catch {
            /* ignore */
          }
        }

        const onMemberJoined = () => {
          if (cancelled || !isHostRef.current) return
          window.setTimeout(() => {
            if (syncHostMapView) emitMapViewNowRef.current()
            emitCartNowRef.current()
            emitItineraryNowRef.current()
          }, 200)
        }

        const onMemberLeft = (payload: { username?: string }) => {
          if (!payload.username) return
          setRemoteCursors((prev) => prev.filter((c) => c.username !== payload.username))
          const m = cursorMarkersRef.current.get(payload.username) as any
          if (m?.setMap) m.setMap(null)
          cursorMarkersRef.current.delete(payload.username)
        }

        socket.on('connect', joinSession)
        socket.on('session:error', onSessionError)
        socket.on('session:ended', onSessionEnded)
        socket.on('session:state', onSessionState)
        socket.on('session:cart', onSessionCart)
        socket.on('session:itinerary', onSessionItinerary)
        socket.on('session:map', onSessionMap)
        socket.on('session:cursor', onSessionCursor)
        socket.on('session:member-joined', onMemberJoined)
        socket.on('session:member-left', onMemberLeft)
        socket.on('connect_error', (err) => {
          if (!cancelled) {
            console.warn('[collab] socket connect_error', err)
            setConnected(false)
            setSessionError('실시간 연결에 실패했어요. API(4000)가 켜져 있는지 확인해 주세요.')
          }
        })
        socket.on('disconnect', () => {
          if (!cancelled) setConnected(false)
        })

        if (socket.connected) joinSession()

        if (!host) {
          const view = stateMapView(r.session.state)
          if (syncHostMapView && view) applyGuestViewRef.current(view)
          if (r.session.state?.cart) applyRemoteCartRef.current(r.session.state.cart)
          applyRemoteItineraryRef.current(r.session.state?.itinerary ?? emptyCollabItinerary())
        } else if (r.session.state?.itinerary) {
          applyRemoteItineraryRef.current(r.session.state.itinerary)
        }
      } catch (err) {
        if (cancelled) return
        const code = err instanceof Error ? err.message : ''
        if (code === 'NOT_FOUND') {
          const uid = userIdRef.current
          const wasHost = Boolean(uid && isHostRef.current)
          setSessionError(
            wasHost
              ? '세션을 찾을 수 없어요. 새 협업 세션을 만들어 주세요.'
              : '세션이 종료됐거나 없어요. 호스트에게 새 초대 링크를 요청해 주세요.',
          )
        } else if (code === 'UNAUTHORIZED') {
          setSessionError('로그인이 필요해요.')
        } else {
          setSessionError('세션 정보를 불러오지 못했어요.')
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
      socket?.disconnect()
      socketRef.current = null
      setConnected(false)
      setRemoteCursors([])
      cursorMarkersRef.current.forEach((m: any) => m?.setMap?.(null))
      cursorMarkersRef.current.clear()
    }
  }, [sessionId, enabled])

  useEffect(() => {
    if (!enabled || !sessionId || !mapReady) return
    const map = mapRef.current
    if (!map) return

    // 지도 뷰 강제 동기화 모드일 때만 게스트 조작을 막음
    setGuestMapInteraction(map, Boolean(syncHostMapView && !isHostRef.current))

    const pending = pendingGuestViewRef.current
    if (syncHostMapView && !isHostRef.current && pending) {
      pendingGuestViewRef.current = null
      applyGuestViewRef.current(pending)
    }

    if (isHostRef.current) {
      if (syncHostMapView) emitMapViewNowRef.current()
    }

    return () => {
      if (mapRef.current) setGuestMapInteraction(mapRef.current, false)
    }
  }, [enabled, sessionId, mapReady, isHost, mapRef, syncHostMapView])

  useEffect(() => {
    if (!enabled || !sessionId || !mapReady || !isHost) return
    const map = mapRef.current
    const mapsApi = getNaverMaps() as
      | { Event: { addListener: (t: unknown, e: string, fn: () => void) => unknown; removeListener: (l: unknown) => void } }
      | undefined
    if (!map || !mapsApi) return

    let emitTimer: number | null = null

    const scheduleEmit = () => {
      if (emitTimer != null) window.clearTimeout(emitTimer)
      emitTimer = window.setTimeout(() => {
        emitMapViewNowRef.current()
      }, 100)
    }

    const l1 = mapsApi.Event.addListener(map, 'idle', scheduleEmit)
    const l2 = mapsApi.Event.addListener(map, 'zoom_changed', scheduleEmit)
    const l3 = mapsApi.Event.addListener(map, 'dragend', scheduleEmit)
    const l4 = mapsApi.Event.addListener(map, 'center_changed', scheduleEmit)
    collabMapListenersRef.current = [
      { remove: () => mapsApi.Event.removeListener(l1) },
      { remove: () => mapsApi.Event.removeListener(l2) },
      { remove: () => mapsApi.Event.removeListener(l3) },
      { remove: () => mapsApi.Event.removeListener(l4) },
    ]

    scheduleEmit()

    return () => {
      if (emitTimer != null) window.clearTimeout(emitTimer)
      collabMapListenersRef.current.forEach((l) => l.remove?.())
      collabMapListenersRef.current = []
    }
  }, [enabled, sessionId, mapReady, isHost, mapRef, getNaverMaps])

  useEffect(() => {
    if (!enabled || !sessionId || !connected || !mapReady) return
    const sock = socketRef.current
    const map = mapRef.current as unknown
    const maps = getNaverMaps()
    if (!sock?.connected || !maps?.Event || !map) return

    // 지도 이벤트의 coord(lat/lng)를 그대로 사용 (projection 불필요)
    const listener = maps.Event.addListener(map, 'mousemove', (ev?: any) => {
      try {
        const coord = ev?.coord ?? ev?.latlng ?? ev?.latLng
        const ll = latLngToNumbers(coord)
        if (!ll) return
        const now = Date.now()
        if (now - lastCursorEmitRef.current < 36) return
        lastCursorEmitRef.current = now
        sock.emit('session:cursor', { lat: ll.lat, lng: ll.lng })
      } catch {
        /* ignore */
      }
    })
    cursorMarkerListenersRef.current.push({ remove: () => maps.Event?.removeListener?.(listener) })

    return () => {
      cursorMarkerListenersRef.current.forEach((l) => l.remove?.())
      cursorMarkerListenersRef.current = []
    }
  }, [enabled, sessionId, connected, mapReady, mapRef, getNaverMaps])

  useEffect(() => {
    if (!enabled || !sessionId || !connected) return
    if (applyingRemoteCartRef.current) return
    const timer = window.setTimeout(() => emitCartNowRef.current(), 120)
    return () => window.clearTimeout(timer)
  }, [cartDays, tripHotelId, enabled, sessionId, connected])

  useEffect(() => {
    if (!enabled || !sessionId || !connected || !isHost) return
    if (applyingRemoteItineraryRef.current) return
    const timer = window.setTimeout(() => emitItineraryNowRef.current(), 120)
    return () => window.clearTimeout(timer)
  }, [itineraryPayload, enabled, sessionId, connected, isHost])

  // 커서는 idle 상태여도 유지 (member-left에서만 제거)

  return { connected, isHost, remoteCursors, sessionError }
}
