import itineraryHomeIconUrl from '../assets/home.png'

import type { SummaryPin } from './api'
import { flattenCartPinsWithLocation } from './itineraryStopDays'

export { itineraryHomeIconUrl }

export function isHotelPin(pin: SummaryPin): boolean {
  if (pin.id.startsWith('recommendation:hotel:')) return true
  if (pin.kind === 'festival') return false
  const ct = String(pin.contentTypeId ?? '').trim()
  if (ct === '32') return true
  const cat1 = pin.detail?.category?.cat1 ?? ''
  const cat2 = pin.detail?.category?.cat2 ?? ''
  const cat3 = pin.detail?.category?.cat3 ?? ''
  return cat1 === 'B02' || cat2.startsWith('B02') || cat3.includes('B02')
}

/** 경로 `stops[order-1]`에 대응하는 장바구니 핀 */
export function pinForRouteStopOrder(
  order: number,
  cartDays: SummaryPin[][],
  tripHotelId: string | null,
): SummaryPin | null {
  const pins = flattenCartPinsWithLocation(cartDays, tripHotelId)
  return pins[order - 1] ?? null
}

export function itineraryHotelMarkerHtml(): string {
  return `<div class="itineraryMapNumMarker itineraryMapNumMarker--hotel" aria-hidden="true"><img src="${itineraryHomeIconUrl}" alt="" /></div>`
}

export function itineraryStopBadgeHtml(order: number, dayColor: string, isHotel: boolean): string {
  if (isHotel) {
    return `<span class="stopNum stopNum--hotel"><img src="${itineraryHomeIconUrl}" alt="" /></span>`
  }
  return `<span class="stopNum" style="background:${dayColor}">${order}</span>`
}
