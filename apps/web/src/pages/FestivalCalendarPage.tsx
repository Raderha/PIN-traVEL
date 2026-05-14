import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { HomeLandingHeader } from '../components/HomeLandingHeader'
import { fetchFestivalDayCounts, fetchFestivalsByDay, type FestivalListItem } from '../lib/api'
import {
  festivalPassesCalendarFilters,
  festivalParkingPossible,
  festivalRegionLabel,
  festivalTimeSlotLabel,
  sortedRegionOptions,
  type CalendarParkingFilter,
  type CalendarTimeSlotFilter,
} from '../lib/calendarFestivalFilters'

type CalendarCell = {
  date: string // YYYY-MM-DD
  day: number
  inMonth: boolean
  dow: number // 0:Sun ... 6:Sat
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toIsoDate(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function parseIsoDate(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return { y, m, d }
}

function monthLabel(year: number, month: number) {
  return `${year}년 ${month}월`
}

function buildCalendarCells(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month - 1, 1)
  const firstDow = first.getDay()
  const lastDay = new Date(year, month, 0).getDate()

  const prevLastDay = new Date(year, month - 1, 0).getDate()
  const prevMonthDate = new Date(year, month - 2, 1)
  const prevYear = prevMonthDate.getFullYear()
  const prevMonth = prevMonthDate.getMonth() + 1

  const nextMonthDate = new Date(year, month, 1)
  const nextYear = nextMonthDate.getFullYear()
  const nextMonth = nextMonthDate.getMonth() + 1

  const cells: CalendarCell[] = []

  // leading (prev month)
  for (let i = firstDow - 1; i >= 0; i--) {
    const day = prevLastDay - i
    const date = toIsoDate(prevYear, prevMonth, day)
    const dow = cells.length % 7
    cells.push({ date, day, inMonth: false, dow })
  }

  // current month
  for (let day = 1; day <= lastDay; day++) {
    const date = toIsoDate(year, month, day)
    const dow = cells.length % 7
    cells.push({ date, day, inMonth: true, dow })
  }

  // trailing (next month) to fill 6 rows
  while (cells.length < 42) {
    const day = cells.length - (firstDow + lastDay) + 1
    const date = toIsoDate(nextYear, nextMonth, day)
    const dow = cells.length % 7
    cells.push({ date, day, inMonth: false, dow })
  }

  return cells
}

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

export function FestivalCalendarPage() {
  const nav = useNavigate()
  const today = useMemo(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
  }, [])

  const [year, setYear] = useState(today.y)
  const [month, setMonth] = useState(today.m)
  const [selectedDate, setSelectedDate] = useState(toIsoDate(today.y, today.m, today.d))

  const [dayCounts, setDayCounts] = useState<Map<string, number>>(new Map())
  const [festivals, setFestivals] = useState<FestivalListItem[]>([])
  const [loadingCounts, setLoadingCounts] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const [filterRegion, setFilterRegion] = useState<string>('all')
  const [filterTimeSlot, setFilterTimeSlot] = useState<CalendarTimeSlotFilter>('all')
  const [filterParking, setFilterParking] = useState<CalendarParkingFilter>('all')

  const cells = useMemo(() => buildCalendarCells(year, month), [year, month])

  const regionOptions = useMemo(() => sortedRegionOptions(festivals), [festivals])

  /** 날짜를 바꿔도 지역 필터 값은 유지; 해당 일 목록에 없는 지역이면 셀렉트에만 남김 */
  const regionSelectOptions = useMemo(() => {
    if (filterRegion !== 'all' && !regionOptions.includes(filterRegion)) {
      return [...regionOptions, filterRegion].sort((a, b) => a.localeCompare(b, 'ko'))
    }
    return regionOptions
  }, [regionOptions, filterRegion])

  const filteredFestivals = useMemo(() => {
    return festivals
      .filter((f) => festivalPassesCalendarFilters(f, filterRegion, filterTimeSlot, filterParking))
      .sort((a, b) => a.title.localeCompare(b.title, 'ko'))
  }, [festivals, filterRegion, filterTimeSlot, filterParking])

  useEffect(() => {
    const ac = new AbortController()
    setLoadingCounts(true)
    setError(null)
    fetchFestivalDayCounts({ year, month }, ac.signal)
      .then((r) => {
        const m = new Map<string, number>()
        for (const { date, count } of r.days) m.set(date, count)
        setDayCounts(m)
      })
      .catch((err) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return
        setError('달력 데이터를 불러오지 못했어요.')
      })
      .finally(() => setLoadingCounts(false))
    return () => ac.abort()
  }, [year, month])

  useEffect(() => {
    const ac = new AbortController()
    setLoadingList(true)
    setError(null)
    fetchFestivalsByDay({ date: selectedDate }, ac.signal)
      .then((r) => setFestivals(r.festivals))
      .catch((err) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return
        setError('축제 리스트를 불러오지 못했어요.')
      })
      .finally(() => setLoadingList(false))
    return () => ac.abort()
  }, [selectedDate])

  useEffect(() => {
    // 날짜를 바꾸면 리스트 접힘만 초기화(필터는 유지)
    setExpanded(false)
  }, [selectedDate])

  function resetFilters() {
    setFilterRegion('all')
    setFilterTimeSlot('all')
    setFilterParking('all')
  }

  const filtersActive =
    filterRegion !== 'all' || filterTimeSlot !== 'all' || filterParking !== 'all'

  function goMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1)
    setYear(d.getFullYear())
    setMonth(d.getMonth() + 1)
    // keep selected date within visible month: snap to 1st
    setSelectedDate(toIsoDate(d.getFullYear(), d.getMonth() + 1, 1))
  }

  function onCellClick(c: CalendarCell) {
    if (c.inMonth) {
      setSelectedDate(c.date)
      return
    }
    const { y, m } = parseIsoDate(c.date)
    setYear(y)
    setMonth(m)
    setSelectedDate(c.date)
  }

  function festivalLatLng(f: FestivalListItem) {
    const coords = f.location?.coordinates
    if (!coords || coords.length < 2) return null
    const [lng, lat] = coords
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng }
  }

  function onFestivalClick(f: FestivalListItem) {
    const ll = festivalLatLng(f)
    if (!ll) return
    const qs = new URLSearchParams({
      lat: String(ll.lat),
      lng: String(ll.lng),
      contentId: f.contentId,
    })
    nav(`/map?${qs.toString()}`)
  }

  return (
    <div className="calendarShell">
      <HomeLandingHeader />

      <section className="page calendarPage">
        <div className={`calendarLayout ${expanded ? 'expanded' : ''}`}>
        <section className="calendarLeft" aria-label="달력">
          <div className="calendarCard">
            <div className="calendarHeader">
              <button className="monthArrow" onClick={() => goMonth(-1)} aria-label="이전 달">
                ◀
              </button>
              <div className="monthTitle">{monthLabel(year, month)}</div>
              <button className="monthArrow" onClick={() => goMonth(1)} aria-label="다음 달">
                ▶
              </button>
            </div>

            <div className="calendarGrid" aria-label="월 달력">
              {DOW_LABELS.map((l, idx) => (
                <div key={l} className={`dowCell ${idx === 0 ? 'sun' : ''} ${idx === 6 ? 'sat' : ''}`}>
                  {l}
                </div>
              ))}

              {cells.map((c) => {
                const count = c.inMonth ? dayCounts.get(c.date) ?? 0 : null
                const isSelected = c.date === selectedDate
                const isSun = c.dow === 0
                const isSat = c.dow === 6

                return (
                  <button
                    key={c.date}
                    type="button"
                    className={[
                      'dayCell',
                      c.inMonth ? 'inMonth' : 'outMonth',
                      isSelected ? 'selected' : '',
                      isSun ? 'sun' : '',
                      isSat ? 'sat' : '',
                    ].join(' ')}
                    onClick={() => onCellClick(c)}
                  >
                    <div className="dayNum">{c.day}</div>
                    {c.inMonth ? (
                      <div className="dayCount">{loadingCounts ? '' : `${count}개`}</div>
                    ) : (
                      <div className="dayCount" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <section className="calendarRight" aria-label="축제 리스트">
          <div className="listHeader">
            <div>
              <h2 className="sectionTitle">축제 리스트</h2>
              <div className="sectionSub">{selectedDate}</div>
            </div>
          </div>

          {!loadingList ? (
            <div className="calendarFilters">
              <div className="calendarFiltersMain" role="group" aria-label="축제 필터">
                <label className="calendarFilterField">
                  <span className="calendarFilterLabel">지역</span>
                  <select
                    className="calendarFilterSelect"
                    value={filterRegion}
                    onChange={(e) => setFilterRegion(e.target.value)}
                  >
                    <option value="all">전체</option>
                    {regionSelectOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="calendarFilterField">
                  <span className="calendarFilterLabel">시간대</span>
                  <select
                    className="calendarFilterSelect"
                    value={filterTimeSlot}
                    onChange={(e) => setFilterTimeSlot(e.target.value as CalendarTimeSlotFilter)}
                  >
                    <option value="all">전체</option>
                    <option value="morning">오전 (12시 미만 운영)</option>
                    <option value="afternoon">오후 (12시 이후 운영)</option>
                  </select>
                </label>
                <label className="calendarFilterField">
                  <span className="calendarFilterLabel">주차</span>
                  <select
                    className="calendarFilterSelect"
                    value={filterParking}
                    onChange={(e) => setFilterParking(e.target.value as CalendarParkingFilter)}
                  >
                    <option value="all">전체</option>
                    <option value="yes">주차 가능</option>
                    <option value="no">주차 불가능</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                className="calendarFilterReset"
                onClick={resetFilters}
                disabled={!filtersActive}
              >
                초기화
              </button>
            </div>
          ) : null}

          {error ? <div className="error">{error}</div> : null}

          {loadingList ? (
            <div className="muted">불러오는 중…</div>
          ) : festivals.length === 0 ? (
            <div className="muted">선택한 날짜에 진행 중인 축제가 없어요.</div>
          ) : filteredFestivals.length === 0 ? (
            <div className="muted">선택한 조건에 맞는 축제가 없어요.</div>
          ) : (
            <div className="festivalList">
              {(expanded ? filteredFestivals : filteredFestivals.slice(0, 2)).map((f) => (
                <article
                  key={f.contentId}
                  className="festivalItem"
                  role="button"
                  tabIndex={0}
                  onClick={() => onFestivalClick(f)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onFestivalClick(f)
                  }}
                >
                  <div className="festivalThumb">
                    {f.image ? <img src={f.image} alt="" loading="lazy" /> : <div className="thumbFallback" />}
                  </div>
                  <div className="festivalBody">
                    <div className="festivalTitle" title={f.title}>
                      {f.title}
                    </div>
                    <div className="festivalMeta">
                      <div className="festivalDates">
                        {f.startDate}~{f.endDate}
                      </div>
                      {f.address?.addr1 ? <div className="festivalLoc">{f.address.addr1}</div> : null}
                      <div className="festivalFilterMeta">
                        <span>{festivalRegionLabel(f)}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{festivalTimeSlotLabel(f)}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{festivalParkingPossible(f) ? '주차 가능' : '주차 불가능'}</span>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loadingList && !expanded && filteredFestivals.length > 2 ? (
            <div className="listMoreWrap">
              <button type="button" className="listMoreBtn" onClick={() => setExpanded(true)}>
                더보기 ({filteredFestivals.length - 2}개)
              </button>
            </div>
          ) : null}
        </section>
        </div>
      </section>
    </div>
  )
}

