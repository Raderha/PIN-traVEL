import { useEffect, useMemo, useState } from 'react'

import { postItineraryScheduleNarrative, type ItineraryRouteResult, type SummaryPin } from '../lib/api'
import { itineraryDayColor, legIndicesForStopDay, maxStopDayIndex } from '../lib/itineraryPaths'
import { computeStopDayIndicesFromCart } from '../lib/itineraryStopDays'

function formatDurationKo(ms: number) {
  const m = Math.max(1, Math.round(ms / 60_000))
  if (m < 60) return `${m}분`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h}시간 ${r}분` : `${h}시간`
}

function formatDistanceKo(meters: number) {
  if (!Number.isFinite(meters)) return ''
  if (meters >= 1000) return `${(meters / 1000).toFixed(1).replace(/\.0$/, '')} km`
  return `${Math.round(meters)} m`
}

function formatNarrativeFailureMessage(raw: string): string {
  const trimmed = raw.trim()
  const nl = trimmed.indexOf('\n')
  const code = nl === -1 ? trimmed : trimmed.slice(0, nl).trim()
  const detail = nl === -1 ? '' : trimmed.slice(nl + 1).trim()

  const heads: Record<string, string> = {
    GEMINI_QUOTA:
      'Gemini 사용 한도(429)에 걸렸어요. Google AI Studio에서 할당량·결제를 확인하거나, 잠시 후 다시 시도해 주세요.',
    GEMINI_FAILED: 'Gemini가 일정 문구를 만들지 못했어요.',
    GEMINI_MODEL_NOT_FOUND:
      '설정한 Gemini 모델 이름을 API에서 찾지 못했어요. apps/api/.env의 GEMINI_MODEL을 확인해 주세요.',
    INVALID_BODY: '서버가 요청 본문을 이해하지 못했어요.',
    ROUTE_NARRATIVE_INVALID: '서버 응답 형식이 올바르지 않아요.',
    GEMINI_NOT_CONFIGURED: '',
    NETWORK_OR_FETCH: '브라우저에서 API 서버로 연결하지 못했어요.',
    INVALID_JSON_RESPONSE: '서버 응답이 JSON이 아니에요.',
    HTTP_404: '요청한 API 경로를 찾을 수 없어요. 웹은 `npm run dev`(Vite 프록시) 또는 API와 같은 출처로 열어 주세요.',
  }

  if (code === 'HTTP_502' && !detail) {
    return '서버(Gemini 호출) 오류(502)예요. API 터미널 로그의 [itinerary/schedule-narrative]를 확인해 주세요.'
  }

  const head = heads[code] ?? `오류 코드: ${code}`
  if (!head && code === 'GEMINI_NOT_CONFIGURED') return ''
  if (detail) return `${head}\n\n${detail}`
  if (head) return `${head}\n\n(추가 메시지 없음 — API 서버 콘솔 로그를 확인해 주세요.)`
  return trimmed
}

function tripCalendarDateForDay(tripStartIso: string, dayIndex: number): string {
  const m = String(tripStartIso).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return tripStartIso
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  base.setDate(base.getDate() + dayIndex)
  const yy = base.getFullYear()
  const mo = String(base.getMonth() + 1).padStart(2, '0')
  const dd = String(base.getDate()).padStart(2, '0')
  return `${yy}-${mo}-${dd}`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

type ItineraryDownloadAiState = {
  scheduleText: string | null
  scheduleLoading: boolean
  scheduleError: string | null
  geminiOff: boolean
}

function buildItineraryDownloadHtml(
  tripStartDate: string,
  route: ItineraryRouteResult,
  dayIndices: number[],
  ai: ItineraryDownloadAiState,
): string {
  const maxD = dayIndices.length ? maxStopDayIndex(dayIndices) : 0

  const daySectionsHtml: string[] = []
  for (let d = 0; d <= maxD; d++) {
    const date = tripCalendarDateForDay(tripStartDate, d)
    const color = itineraryDayColor(d)
    const legIdx = legIndicesForStopDay(dayIndices, d)
    const stops = route.stops.filter((_, i) => (dayIndices[i] ?? 0) === d)
    if (stops.length === 0 && legIdx.length === 0) continue

    const legsHtml =
      legIdx.length > 0
        ? `<h3 class="subTitle">이동 경로</h3><ol class="legList">${legIdx
            .map((j) => {
              const leg = route.legs[j]
              if (!leg) return ''
              return `<li class="leg"><div class="legTitle">${escapeHtml(leg.fromTitle)} → ${escapeHtml(leg.toTitle)}</div><div class="legMeta">차량 · 약 ${escapeHtml(formatDurationKo(leg.durationMs))} (${escapeHtml(formatDistanceKo(leg.distanceM))})</div></li>`
            })
            .join('')}</ol>`
        : ''

    const stopsHtml =
      stops.length > 0
        ? `<h3 class="subTitle">방문지</h3><ul class="stopList">${stops
            .map((s) => {
              const bg = itineraryDayColor(dayIndices[s.order - 1] ?? 0)
              const time = s.time?.trim() ? escapeHtml(s.time) : '정보 없음'
              const fee = s.fee?.trim() ? escapeHtml(s.fee) : '정보 없음'
              return `<li class="stop"><div class="stopTitle"><span class="stopNum" style="background:${bg}">${s.order}</span>${escapeHtml(s.title)}</div><dl class="stopDl"><div><dt>관람/운영</dt><dd>${time}</dd></div><div><dt>입장료</dt><dd>${fee}</dd></div></dl></li>`
            })
            .join('')}</ul>`
        : ''

    daySectionsHtml.push(
      `<section class="daySection"><h2 class="dayTitle"><span class="dayDot" style="background:${color}"></span>${d + 1}일차 <span class="dayDate">(${escapeHtml(date)})</span></h2>${legsHtml}${stopsHtml}</section>`,
    )
  }

  const geminiLine = route.departure.geminiRoadAddress
    ? `<p class="sub">Gemini 도로명: ${escapeHtml(route.departure.geminiRoadAddress)}</p>`
    : ''
  const addrLine =
    route.departure.roadAddress || route.departure.jibunAddress
      ? `<p class="sub">${escapeHtml(route.departure.roadAddress ?? route.departure.jibunAddress ?? '')}</p>`
      : ''

  let aiBlock = '<h2 class="sectionTitle">AI 일정 요약</h2>'
  if (ai.scheduleLoading) {
    aiBlock += `<p class="muted">저장 시점에 AI 요약이 아직 생성 중이었을 수 있어요. 잠시 후 화면에서 다시 확인해 주세요.</p>`
  } else if (ai.geminiOff) {
    aiBlock += `<p class="muted">서버에 <code>GEMINI_API_KEY</code>가 없으면 AI 요약은 생략됩니다.</p>`
  } else if (ai.scheduleError) {
    aiBlock += `<pre class="err">${escapeHtml(ai.scheduleError)}</pre>`
  } else if (ai.scheduleText) {
    aiBlock += `<pre class="gemini">${escapeHtml(ai.scheduleText)}</pre>`
  } else {
    aiBlock += `<p class="muted">AI 요약이 없습니다.</p>`
  }

  const css = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans KR", sans-serif; background: #f3f4f6; color: #1f2937; margin: 0; padding: 24px 16px 40px; line-height: 1.45; }
.wrap { max-width: 520px; margin: 0 auto; background: #fff; padding: 22px 20px 28px; border-radius: 14px; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.1); }
.brand { font-size: 13px; font-weight: 800; color: #5b21b6; letter-spacing: -0.02em; margin: 0 0 6px; }
h1.docTitle { font-size: 18px; font-weight: 900; color: #111827; margin: 0 0 14px; }
.hint { font-size: 12px; font-weight: 650; color: #6b7280; margin: 0 0 14px; line-height: 1.5; }
.meta { font-size: 14px; font-weight: 700; color: #374151; margin: 0 0 8px; }
.meta strong { font-weight: 900; color: #111827; }
.sub { font-size: 12px; font-weight: 700; color: #6b7280; margin: 0 0 10px; line-height: 1.4; }
.summary { margin: 0 0 18px; padding: 10px 12px; border-radius: 10px; background: #f9fafb; font-size: 13px; font-weight: 800; color: #111827; border: 1px solid #eef0f4; }
.sectionTitle { font-size: 15px; font-weight: 900; color: #111827; margin: 22px 0 10px; }
.daySection { margin-top: 4px; padding-bottom: 6px; }
.dayTitle { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 15px; font-weight: 900; color: #111827; margin: 18px 0 10px; }
.dayDot { width: 10px; height: 10px; border-radius: 999px; flex-shrink: 0; }
.dayDate { font-size: 13px; font-weight: 700; color: #6b7280; }
.subTitle { font-size: 13px; font-weight: 900; color: #374151; margin: 12px 0 6px; }
.legList { margin: 0; padding: 0 0 0 18px; }
.leg { margin-bottom: 12px; }
.legTitle { font-size: 14px; font-weight: 900; color: #111827; line-height: 1.35; }
.legMeta { margin-top: 4px; font-size: 12px; font-weight: 700; color: #6b7280; }
.stopList { margin: 0; padding: 0; list-style: none; }
.stop { padding: 12px 0; border-bottom: 1px solid #eef0f4; }
.stopTitle { display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 900; color: #111827; }
.stopNum { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 999px; color: #fff; font-size: 12px; font-weight: 900; flex-shrink: 0; }
.stopDl { margin: 8px 0 0; }
.stopDl > div { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 6px; padding: 4px 0; font-size: 12px; }
.stopDl dt { color: #9ca3af; font-weight: 900; }
.stopDl dd { margin: 0; color: #4b5563; font-weight: 700; line-height: 1.35; }
.muted { font-size: 12px; font-weight: 650; color: #6b7280; margin: 8px 0 0; line-height: 1.45; }
code { font-size: 11px; font-weight: 800; padding: 1px 6px; border-radius: 4px; background: #f3f4f6; }
.err { margin: 10px 0 0; padding: 10px 12px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; font-size: 12px; font-weight: 650; color: #991b1b; white-space: pre-wrap; word-break: break-word; }
.gemini { margin-top: 10px; padding: 12px 14px; border-radius: 10px; background: #f9fafb; border: 1px solid #e5e7eb; font-size: 13px; font-weight: 600; color: #1f2937; white-space: pre-wrap; word-break: break-word; }
.foot { margin: 28px 0 0; font-size: 11px; font-weight: 700; color: #9ca3af; }
`

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(`PIN-traVEL 일정 · ${tripStartDate}`)}</title>
<style>${css}</style>
</head>
<body>
<main class="wrap">
<p class="brand">PIN-traVEL</p>
<h1 class="docTitle">일정</h1>
<p class="hint">위 버튼으로 지도 경로를 전체 또는 일차별로 볼 수 있어요. 방문 순서는 장바구니 일차·담은 순서와 같습니다.</p>
<p class="meta">여행 기간: <strong>${escapeHtml(tripStartDate)}</strong></p>
<p class="meta">출발지: <strong>${escapeHtml(route.departure.query)}</strong></p>
${geminiLine}
${addrLine}
<p class="summary">총 거리 ${escapeHtml(formatDistanceKo(route.totalDistanceM))} · 차량 이동 약 ${escapeHtml(formatDurationKo(route.totalDurationMs))}</p>
${daySectionsHtml.join('\n')}
${aiBlock}
<p class="foot">※ 본 파일은 PIN-traVEL에서 저장한 일정입니다. 브라우저에서 인쇄하면 PDF로 저장할 수 있어요.</p>
</main>
</body>
</html>`
}

type ItineraryRoutePanelProps = {
  tripStartDate: string
  route: ItineraryRouteResult
  cartDays: SummaryPin[][]
  /** 여러 일차에 반복되는 숙소 id — 일차별 경로·요약과 장바구니 정렬을 맞출 때 사용 */
  tripHotelId?: string | null
  selectedMapItineraryDay: number | 'all'
  onSelectMapItineraryDay: (day: number | 'all') => void
  onClose: () => void
  /** 상세 정보 탭과 같은 패널 안에 넣을 때 — 바깥 `aside`·일정 제목 헤더 생략 */
  embedded?: boolean
}

export function ItineraryRoutePanel({
  tripStartDate,
  route,
  cartDays,
  tripHotelId = null,
  selectedMapItineraryDay,
  onSelectMapItineraryDay,
  onClose,
  embedded = false,
}: ItineraryRoutePanelProps) {
  const [scheduleText, setScheduleText] = useState<string | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [geminiOff, setGeminiOff] = useState(false)

  const rawDayIndices = useMemo(() => computeStopDayIndicesFromCart(cartDays, tripHotelId), [cartDays, tripHotelId])
  const dayIndices = useMemo(
    () => route.stops.map((_, i) => rawDayIndices[i] ?? 0),
    [route.stops, rawDayIndices],
  )

  const maxDay = useMemo(() => (dayIndices.length ? maxStopDayIndex(dayIndices) : 0), [dayIndices])

  const narrativeKey = useMemo(
    () =>
      JSON.stringify({
        tripStartDate,
        dep: route.departure.query,
        legs: route.legs,
        stops: route.stops.map((s, i) => ({
          o: s.order,
          t: s.title,
          d: dayIndices[i] ?? 0,
        })),
      }),
    [tripStartDate, route.departure.query, route.legs, route.stops, dayIndices],
  )

  useEffect(() => {
    const ac = new AbortController()
    setScheduleLoading(true)
    setScheduleError(null)
    setGeminiOff(false)
    setScheduleText(null)

    const body = {
      tripStartDate,
      departureQuery: route.departure.query,
      legs: route.legs,
      stops: route.stops.map((s, i) => ({
        order: s.order,
        title: s.title,
        dayIndex: dayIndices[i] ?? 0,
        fee: s.fee ?? null,
        time: s.time ?? null,
      })),
    }

    postItineraryScheduleNarrative(body, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return
        setScheduleText(r.text)
        setScheduleLoading(false)
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return
        if (e instanceof DOMException && e.name === 'AbortError') return
        setScheduleLoading(false)
        const raw = e instanceof Error ? e.message : String(e)
        if (raw === 'GEMINI_NOT_CONFIGURED' || raw.startsWith('GEMINI_NOT_CONFIGURED')) {
          setGeminiOff(true)
          return
        }
        setScheduleError(formatNarrativeFailureMessage(raw))
      })

    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrativeKey])

  const downloadName = useMemo(() => {
    const safe = tripStartDate.replace(/[^\d-]/g, '')
    return `pintravel-일정-${safe || 'trip'}.html`
  }, [tripStartDate])

  function onDownload() {
    const html = buildItineraryDownloadHtml(tripStartDate, route, dayIndices, {
      scheduleText,
      scheduleLoading,
      scheduleError,
      geminiOff,
    })
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = downloadName
    a.click()
    URL.revokeObjectURL(url)
  }

  const dayChipList = useMemo(() => {
    const out: Array<number | 'all'> = ['all']
    for (let d = 0; d <= maxDay; d++) out.push(d)
    return out
  }, [maxDay])

  const itineraryMain = (
    <>
      <div className="mapItineraryDayChips" role="tablist" aria-label="지도에 표시할 일차">
        {dayChipList.map((d) => {
          const active = selectedMapItineraryDay === d
          const label = d === 'all' ? '전체' : `${Number(d) + 1}일차`
          const color = d === 'all' ? undefined : itineraryDayColor(d)
          return (
            <button
              key={String(d)}
              type="button"
              role="tab"
              aria-selected={active}
              className={`mapItineraryDayChip ${active ? 'mapItineraryDayChip--active' : ''}`}
              style={
                d !== 'all' && active
                  ? { borderColor: color, color, boxShadow: `inset 0 -2px 0 ${color}` }
                  : undefined
              }
              onClick={() => onSelectMapItineraryDay(d)}
            >
              {d !== 'all' ? (
                <span className="mapItineraryDayChipDot" style={{ background: color }} aria-hidden />
              ) : null}
              {label}
            </button>
          )
        })}
      </div>

      <div className="mapItineraryPanelBody">
        <p className="mapItinerarySub mapItinerarySub--mapHint">
          위 버튼으로 지도 경로를 전체 또는 일차별로 볼 수 있어요. 방문 순서는 장바구니 일차·담은 순서와 같습니다.
        </p>

        <p className="mapItineraryMeta">
          여행 기간: <strong>{tripStartDate}</strong>
        </p>
        <p className="mapItineraryMeta">
          출발지: <strong>{route.departure.query}</strong>
        </p>
        {route.departure.geminiRoadAddress ? (
          <p className="mapItinerarySub">Gemini 도로명: {route.departure.geminiRoadAddress}</p>
        ) : null}
        {(route.departure.roadAddress || route.departure.jibunAddress) && (
          <p className="mapItinerarySub">{route.departure.roadAddress ?? route.departure.jibunAddress}</p>
        )}
        <p className="mapItinerarySummaryLine">
          총 거리 {formatDistanceKo(route.totalDistanceM)} · 차량 이동 약 {formatDurationKo(route.totalDurationMs)}
        </p>

        {Array.from({ length: maxDay + 1 }, (_, d) => {
          const date = tripCalendarDateForDay(tripStartDate, d)
          const color = itineraryDayColor(d)
          const legIdx = legIndicesForStopDay(dayIndices, d)
          const stops = route.stops.filter((_, i) => (dayIndices[i] ?? 0) === d)
          if (stops.length === 0 && legIdx.length === 0) return null

          return (
            <section key={d} className="mapItineraryDaySection">
              <h2 className="mapItinerarySectionTitle mapItinerarySectionTitle--day">
                <span className="mapItineraryDayDot" style={{ background: color }} aria-hidden />
                {d + 1}일차 <span className="mapItineraryDayDate">({date})</span>
              </h2>

              {legIdx.length > 0 ? (
                <>
                  <h3 className="mapItinerarySubTitle">이동 경로</h3>
                  <ol className="mapItineraryLegList">
                    {legIdx.map((j) => {
                      const leg = route.legs[j]
                      if (!leg) return null
                      return (
                        <li key={j} className="mapItineraryLeg">
                          <div className="mapItineraryLegTitle">
                            {leg.fromTitle} → {leg.toTitle}
                          </div>
                          <div className="mapItineraryLegMeta">
                            차량 · 약 {formatDurationKo(leg.durationMs)} ({formatDistanceKo(leg.distanceM)})
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </>
              ) : null}

              {stops.length > 0 ? (
                <>
                  <h3 className="mapItinerarySubTitle">방문지</h3>
                  <ul className="mapItineraryStopList">
                    {stops.map((s) => (
                      <li key={s.order} className="mapItineraryStop">
                        <div className="mapItineraryStopTitle">
                          <span
                            className="mapItineraryStopNum"
                            style={{ background: itineraryDayColor(dayIndices[s.order - 1] ?? 0) }}
                          >
                            {s.order}
                          </span>
                          {s.title}
                        </div>
                        <dl className="mapItineraryStopDl">
                          <div>
                            <dt>관람/운영</dt>
                            <dd>{s.time?.trim() ? s.time : '정보 없음'}</dd>
                          </div>
                          <div>
                            <dt>입장료</dt>
                            <dd>{s.fee?.trim() ? s.fee : '정보 없음'}</dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          )
        })}

        <h2 className="mapItinerarySectionTitle">AI 일정 요약</h2>
        {scheduleLoading ? <p className="mapItineraryScheduleLoading">Gemini가 일정을 정리하는 중…</p> : null}
        {geminiOff ? (
          <p className="mapItinerarySub mapItinerarySub--scheduleHint">
            서버에 <code className="mapItineraryCode">GEMINI_API_KEY</code>가 없으면 AI 요약은 생략돼요.
          </p>
        ) : null}
        {scheduleError ? (
          <pre className="mapItineraryScheduleError mapItineraryScheduleError--pre">{scheduleError}</pre>
        ) : null}
        {scheduleText ? <div className="mapItineraryGeminiBody">{scheduleText}</div> : null}
        {!scheduleLoading && (geminiOff || scheduleError) ? (
          <p className="mapItinerarySub mapItinerarySub--scheduleHint">
            일차별 이동·방문지는 위 섹션에서 확인할 수 있어요.
          </p>
        ) : null}
      </div>

      <div className="mapItineraryPanelFooter">
        <button type="button" className="mapItineraryDownloadBtn" onClick={onDownload}>
          일정 다운로드
        </button>
      </div>
    </>
  )

  if (embedded) {
    return <div className="mapItineraryEmbed">{itineraryMain}</div>
  }

  return (
    <aside className="mapItineraryPanel" aria-label="일정 경로">
      <div className="mapItineraryPanelHeader mapItineraryPanelHeader--single">
        <h2 className="mapItineraryHeaderTitle">일정</h2>
        <button type="button" className="mapItineraryClose" aria-label="일정 패널 닫기" onClick={onClose}>
          ×
        </button>
      </div>
      {itineraryMain}
    </aside>
  )
}
