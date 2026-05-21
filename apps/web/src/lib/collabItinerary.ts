import type { ItineraryRouteResult } from './api'

export type CollabItineraryBasics = {
  departure: string
  tripStartDate: string
}

export type CollabItineraryNarrative = {
  text: string | null
  loading: boolean
  error: string | null
  geminiOff: boolean
}

export type CollabItineraryPayload = {
  basics: CollabItineraryBasics | null
  route: ItineraryRouteResult | null
  narrative: CollabItineraryNarrative
  itineraryMapDay: number | 'all'
  itinerarySummaryPinsOn: boolean
  itineraryLoading: boolean
  itineraryError: string | null
}

export function emptyCollabItineraryNarrative(): CollabItineraryNarrative {
  return { text: null, loading: false, error: null, geminiOff: false }
}

export function emptyCollabItinerary(): CollabItineraryPayload {
  return {
    basics: null,
    route: null,
    narrative: emptyCollabItineraryNarrative(),
    itineraryMapDay: 'all',
    itinerarySummaryPinsOn: false,
    itineraryLoading: false,
    itineraryError: null,
  }
}

function normalizeRoute(raw: unknown): ItineraryRouteResult | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as ItineraryRouteResult
  if (!Array.isArray(r.path) || !Array.isArray(r.stops) || !Array.isArray(r.legs)) return null
  if (!r.departure || typeof r.departure.query !== 'string') return null
  return r
}

function normalizeNarrative(raw: unknown): CollabItineraryNarrative {
  if (!raw || typeof raw !== 'object') return emptyCollabItineraryNarrative()
  const n = raw as CollabItineraryNarrative
  return {
    text: typeof n.text === 'string' ? n.text : null,
    loading: Boolean(n.loading),
    error: typeof n.error === 'string' ? n.error : null,
    geminiOff: Boolean(n.geminiOff),
  }
}

export function normalizeCollabItineraryPayload(raw: unknown): CollabItineraryPayload {
  if (!raw || typeof raw !== 'object') return emptyCollabItinerary()
  const o = raw as Partial<CollabItineraryPayload>

  let basics: CollabItineraryBasics | null = null
  if (o.basics && typeof o.basics === 'object') {
    const b = o.basics as CollabItineraryBasics
    if (typeof b.departure === 'string' && typeof b.tripStartDate === 'string') {
      basics = { departure: b.departure, tripStartDate: b.tripStartDate }
    }
  }

  const route = normalizeRoute(o.route)
  const mapDay = o.itineraryMapDay === 'all' || typeof o.itineraryMapDay === 'number' ? o.itineraryMapDay : 'all'

  return {
    basics,
    route,
    narrative: normalizeNarrative(o.narrative),
    itineraryMapDay: mapDay,
    itinerarySummaryPinsOn: Boolean(o.itinerarySummaryPinsOn),
    itineraryLoading: Boolean(o.itineraryLoading),
    itineraryError: typeof o.itineraryError === 'string' ? o.itineraryError : null,
  }
}

export function collabItineraryPayloadEquals(a: CollabItineraryPayload, b: CollabItineraryPayload): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
