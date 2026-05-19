import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { io, type Socket } from 'socket.io-client'

import { fetchSession, type CollabSessionState } from '../lib/api'

export type RemoteCursor = {
  username: string
  x: number
  y: number
  updatedAt: number
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
  getNaverMaps: () => { LatLng: new (lat: number, lng: number) => unknown } | undefined
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
  const pendingGuestViewRef = useRef<MapView | null>(null)
  const lastCursorEmitRef = useRef(0)
  const collabMapListenersRef = useRef<Array<{ remove?: () => void }>>([])

  const applyGuestView = useCallback(
    (view: MapView) => {
      const map = mapRef.current
      if (!map) {
        pendingGuestViewRef.current = view
        return
      }
      applyingRemoteMapRef.current = true
      applyMapView(map, getNaverMaps, view)
      window.setTimeout(() => {
        applyingRemoteMapRef.current = false
      }, 400)
    },
    [mapRef, getNaverMaps],
  )

  const emitMapViewNow = useCallback(() => {
    if (!isHostRef.current || applyingRemoteMapRef.current) return false
    const map = mapRef.current
    if (!map) return false
    const view = readMapView(map)
    if (!view || !socketRef.current?.connected) return false
    socketRef.current.emit('session:map', view)
    return true
  }, [mapRef])

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

        const onConnect = () => {
          if (cancelled) return
          setConnected(true)
          setSessionError(null)
          socket!.emit('session:join', {
            sessionId,
            username: usernameRef.current,
            userId: userIdRef.current,
          })
        }

        const onSessionState = (payload: { sessionId?: string; state?: CollabSessionState }) => {
          if (cancelled || payload.sessionId !== sessionId || isHostRef.current) return
          const view = stateMapView(payload.state)
          if (view) applyGuestView(view)
        }

        const onSessionMap = (payload: { center?: { lat: number; lng: number }; zoom?: number }) => {
          if (cancelled || isHostRef.current) return
          if (!payload.center || payload.zoom == null) return
          applyGuestView({ center: payload.center, zoom: payload.zoom })
        }

        const onSessionCursor = (payload: { username?: string; x?: number; y?: number }) => {
          if (cancelled) return
          const name = payload.username ?? 'guest'
          if (name === usernameRef.current) return
          if (typeof payload.x !== 'number' || typeof payload.y !== 'number') return
          setRemoteCursors((prev) => {
            const next = prev.filter((c) => c.username !== name)
            next.push({ username: name, x: payload.x!, y: payload.y!, updatedAt: Date.now() })
            return next
          })
        }

        const onMemberJoined = () => {
          if (cancelled || !isHostRef.current) return
          window.setTimeout(() => emitMapViewNow(), 200)
        }

        const onMemberLeft = (payload: { username?: string }) => {
          if (!payload.username) return
          setRemoteCursors((prev) => prev.filter((c) => c.username !== payload.username))
        }

        socket.on('connect', onConnect)
        socket.on('session:state', onSessionState)
        socket.on('session:map', onSessionMap)
        socket.on('session:cursor', onSessionCursor)
        socket.on('session:member-joined', onMemberJoined)
        socket.on('session:member-left', onMemberLeft)
        socket.on('connect_error', (err) => {
          if (!cancelled) {
            console.warn('[collab] socket connect_error', err)
            setSessionError('실시간 연결에 실패했어요. API(4000)가 켜져 있는지 확인해 주세요.')
          }
        })

        if (!host) {
          const view = stateMapView(r.session.state)
          if (view) applyGuestView(view)
        }
      } catch (err) {
        if (cancelled) return
        const code = err instanceof Error ? err.message : ''
        if (code === 'NOT_FOUND') {
          setSessionError(
            '세션을 찾을 수 없어요. 호스트가 세션을 만든 뒤 API가 재시작되지 않았는지 확인하고, 세션을 다시 만들어 주세요.',
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
    }
  }, [sessionId, enabled, applyGuestView, emitMapViewNow])

  useEffect(() => {
    if (!enabled || !sessionId || !mapReady) return
    const map = mapRef.current
    if (!map) return

    setGuestMapInteraction(map, !isHostRef.current)

    const pending = pendingGuestViewRef.current
    if (!isHostRef.current && pending) {
      pendingGuestViewRef.current = null
      applyGuestView(pending)
    }

    if (isHostRef.current) {
      emitMapViewNow()
    }

    return () => {
      if (mapRef.current) setGuestMapInteraction(mapRef.current, false)
    }
  }, [enabled, sessionId, mapReady, isHost, mapRef, applyGuestView, emitMapViewNow])

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
        emitMapViewNow()
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
  }, [enabled, sessionId, mapReady, isHost, mapRef, getNaverMaps, emitMapViewNow])

  useEffect(() => {
    if (!enabled || !sessionId || !connected) return

    const onMove = (e: MouseEvent) => {
      const el = mapElementRef.current
      const sock = socketRef.current
      if (!el || !sock?.connected) return
      const rect = el.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
        return
      }
      const now = Date.now()
      if (now - lastCursorEmitRef.current < 36) return
      lastCursorEmitRef.current = now
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height
      sock.emit('session:cursor', { x, y })
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [enabled, sessionId, connected, mapElementRef])

  useEffect(() => {
    if (!enabled) return
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 8000
      setRemoteCursors((prev) => (prev.some((c) => c.updatedAt < cutoff) ? prev.filter((c) => c.updatedAt >= cutoff) : prev))
    }, 2000)
    return () => window.clearInterval(id)
  }, [enabled])

  return { connected, isHost, remoteCursors, sessionError }
}
