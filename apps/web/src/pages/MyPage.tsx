import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { HomeLandingHeader } from '../components/HomeLandingHeader'
import mypageImageUrl from '../assets/mypageimg.jpg'
import { fetchMySchedules, type MyScheduleHistoryItem } from '../lib/api'

const PAGE_SIZE = 8

function readStoredUsername() {
  if (typeof window === 'undefined') return 'User'
  try {
    const raw = localStorage.getItem('pintravel_user')
    if (!raw) return 'User'
    const parsed = JSON.parse(raw) as { username?: string }
    return parsed.username?.trim() || 'User'
  } catch {
    return 'User'
  }
}

function formatPeriod(item: MyScheduleHistoryItem) {
  if (item.tripStartDate === item.tripEndDate) return item.tripStartDate
  return `${item.tripStartDate} ~ ${item.tripEndDate}`
}

function formatMainStops(item: MyScheduleHistoryItem) {
  if (item.mainStops.length === 0) return item.departure
  const [first, ...rest] = item.mainStops
  const suffix = rest.length > 0 ? ` · ${rest.slice(0, 2).join(' · ')} 등` : ''
  return `${first}${suffix}`
}

function formatDayStops(day: MyScheduleHistoryItem['visitDays'][number]) {
  const titles = day.stops.map((stop) => stop.title).filter(Boolean)
  return titles.length ? titles.join(' → ') : '등록된 방문지가 없어요.'
}

export function MyPage() {
  const nav = useNavigate()
  const username = useMemo(() => readStoredUsername(), [])
  const [schedules, setSchedules] = useState<MyScheduleHistoryItem[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(schedules.length / PAGE_SIZE))
  const pageSchedules = schedules.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
    if (!token) {
      nav('/login?next=/mypage', { replace: true })
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)
    fetchMySchedules(ac.signal)
      .then((r) => {
        if (!ac.signal.aborted) {
          setSchedules(r.schedules)
          setPage(1)
          setExpandedIds(new Set())
        }
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return
        const code = err instanceof Error ? err.message : ''
        if (code === 'UNAUTHORIZED') nav('/login?next=/mypage', { replace: true })
        else setError('여행 히스토리를 불러오지 못했어요.')
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false)
      })

    return () => ac.abort()
  }, [nav])

  return (
    <div className="myPageShell">
      <HomeLandingHeader />

      <section className="myPage" aria-label="마이페이지">
        <div className="myPageIllustration" aria-hidden="true">
          <img src={mypageImageUrl} alt="" />
        </div>

        <main className="myPageContent">
          <p className="myPageWelcome">Welcome, {username}</p>
          <h1 className="myPageTitle">
            <span>{username}</span>님의 여행 히스토리
          </h1>

          <div className="myPageTableWrap">
            <div className="myPageTableHeader myPageTableRow">
              <span>Travel ID</span>
              <span>기간</span>
              <span>주요 일정</span>
              <span>참여 인원</span>
            </div>

            {loading ? <div className="myPageState">여행 히스토리를 불러오는 중이에요.</div> : null}
            {error ? <div className="myPageState myPageStateError">{error}</div> : null}
            {!loading && !error && schedules.length === 0 ? (
              <div className="myPageState">아직 확정된 여행 일정이 없어요.</div>
            ) : null}

            {!loading && !error
              ? pageSchedules.map((schedule) => {
                  const expanded = expandedIds.has(schedule.id)
                  return (
                    <article key={schedule.id} className={`myPageHistoryItem ${expanded ? 'isExpanded' : ''}`}>
                      <div className="myPageTableRow myPageHistoryRow">
                        <span className="myPageTravelId">{schedule.travelId}</span>
                        <span>{formatPeriod(schedule)}</span>
                        <span>{formatMainStops(schedule)}</span>
                        <span>{schedule.participantCount}</span>
                        <button
                          type="button"
                          className="myPageExpandBtn"
                          aria-expanded={expanded}
                          aria-label={`${schedule.travelId} 일정 상세 ${expanded ? '닫기' : '열기'}`}
                          onClick={() => toggleExpanded(schedule.id)}
                        >
                          ˅
                        </button>
                      </div>

                      {expanded ? (
                        <div className="myPageScheduleDetail">
                          {schedule.visitDays.length ? (
                            schedule.visitDays.map((day) => (
                              <div key={`${schedule.id}:${day.dayIndex}`} className="myPageScheduleDay">
                                <strong>{day.dayIndex + 1}일차 일정</strong>
                                <span>{formatDayStops(day)}</span>
                              </div>
                            ))
                          ) : (
                            <div className="myPageScheduleDay">
                              <strong>일정 상세</strong>
                              <span>등록된 방문지가 없어요.</span>
                            </div>
                          )}
                        </div>
                      ) : null}
                    </article>
                  )
                })
              : null}
          </div>

          <div className="myPagePager" aria-label="히스토리 페이지">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              이전
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              다음
            </button>
          </div>
        </main>
      </section>
    </div>
  )
}
