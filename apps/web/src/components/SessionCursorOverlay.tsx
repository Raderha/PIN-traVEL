import { useEffect, useMemo, useState, type RefObject } from 'react'

import type { RemoteCursor } from '../hooks/useCollabSession'

type SessionCursorOverlayProps = {
  cursors: RemoteCursor[]
  mapRef: RefObject<unknown | null>
  mapElementRef: RefObject<HTMLElement | null>
  getNaverMaps: () =>
    | { LatLng: new (lat: number, lng: number) => unknown; Point?: new (x: number, y: number) => unknown }
    | undefined
}

const CURSOR_COLORS = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777']

function colorForUsername(username: string) {
  let h = 0
  for (let i = 0; i < username.length; i++) h = (h * 31 + username.charCodeAt(i)) | 0
  return CURSOR_COLORS[Math.abs(h) % CURSOR_COLORS.length]
}

export function SessionCursorOverlay({ cursors, mapRef, mapElementRef, getNaverMaps }: SessionCursorOverlayProps) {
  if (cursors.length === 0) return null

  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({})

  const computePositions = useMemo(() => {
    return () => {
      try {
        const el = mapElementRef.current
        const map = mapRef.current as unknown as { getProjection?: () => unknown } | null
        const maps = getNaverMaps()
        if (!el || !map?.getProjection || !maps) return
        const rect = el.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const proj = map.getProjection?.()
        const fromCoordToOffset = (proj as unknown as { fromCoordToOffset?: (c: unknown) => unknown }).fromCoordToOffset
        if (!fromCoordToOffset) return

        const next: Record<string, { x: number; y: number }> = {}
        for (const c of cursors) {
          try {
            const ll = new maps.LatLng(c.lat, c.lng)
            const p = fromCoordToOffset(ll) as unknown as { x?: number | (() => number); y?: number | (() => number) }
            const x = typeof p.x === 'function' ? p.x() : p.x
            const y = typeof p.y === 'function' ? p.y() : p.y
            if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
            if (x < 0 || y < 0 || x > rect.width || y > rect.height) continue
            next[c.username] = { x, y }
          } catch {
            // ignore single cursor conversion failure
          }
        }
        setPositions(next)
      } catch {
        // ignore projection failures (e.g., map not ready)
      }
    }
  }, [cursors, mapElementRef, mapRef, getNaverMaps])

  useEffect(() => {
    computePositions()
    const id = window.setInterval(computePositions, 200)
    return () => window.clearInterval(id)
  }, [computePositions])

  return (
    <div className="sessionCursorLayer" aria-hidden="true">
      {cursors.map((c) => {
        const pos = positions[c.username]
        if (!pos) return null
        return (
        <div
          key={c.username}
          className="sessionRemoteCursor"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            ['--cursor-color' as string]: colorForUsername(c.username),
          }}
        >
          <span className="sessionRemoteCursorDot" />
          <span className="sessionRemoteCursorPointer" />
          <span className="sessionRemoteCursorLabel">{c.username}</span>
        </div>
        )
      })}
    </div>
  )
}
