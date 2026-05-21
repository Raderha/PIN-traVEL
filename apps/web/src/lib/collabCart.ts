import type { SummaryPin } from './api'

/** 협업 세션 장바구니 스냅샷(일차별 핀 전체) */
export type CollabCartPayload = {
  cartDays: SummaryPin[][]
  tripHotelId: string | null
}

export function emptyCollabCart(): CollabCartPayload {
  return { cartDays: [[]], tripHotelId: null }
}

export function normalizeCollabCartPayload(raw: unknown): CollabCartPayload {
  if (!raw || typeof raw !== 'object') return emptyCollabCart()
  const o = raw as { cartDays?: unknown; tripHotelId?: unknown; placeIds?: unknown }

  if (Array.isArray(o.cartDays)) {
    const cartDays = o.cartDays
      .filter((day): day is SummaryPin[] => Array.isArray(day))
      .map((day) => day.filter((p): p is SummaryPin => p != null && typeof p === 'object' && typeof p.id === 'string'))
    return {
      cartDays: cartDays.length > 0 ? cartDays : [[]],
      tripHotelId: typeof o.tripHotelId === 'string' ? o.tripHotelId : null,
    }
  }

  return emptyCollabCart()
}

export function collabCartPayloadEquals(a: CollabCartPayload, b: CollabCartPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
