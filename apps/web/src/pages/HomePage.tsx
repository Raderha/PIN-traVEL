import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import mainHeroImageUrl from '../assets/mainpage_img.png'
import featureCalendarUrl from '../assets/mainpage_calendar.png'
import featureMapUrl from '../assets/mainpage_map.png'
import { HomeLandingHeader } from '../components/HomeLandingHeader'
import { fetchMainFestivals, type FestivalListItem } from '../lib/api'

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function formatYmd(value: string | null | undefined) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${y}.${m}.${d}`
  }
  if (/^\d{8}$/.test(value)) {
    const y = value.slice(0, 4)
    const m = value.slice(4, 6)
    const d = value.slice(6, 8)
    return `${y}.${m}.${d}`
  }
  return value
}

function formatDateRange(start: string | null | undefined, end: string | null | undefined) {
  const s = formatYmd(start)
  const e = formatYmd(end)
  if (s && e) return `${s}~${e}`
  if (s) return s
  if (e) return e
  return '기간 정보 없음'
}

function toComparableIso(value: string | null | undefined) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`
  return null
}

function isActiveOnDate(festival: FestivalListItem, isoDate: string) {
  const start = toComparableIso(festival.startDate)
  const end = toComparableIso(festival.endDate)
  if (!start || !end) return false
  return start <= isoDate && isoDate <= end
}

function isBusanFirst(a: FestivalListItem, b: FestivalListItem) {
  const aAddr = `${a.address?.addr1 ?? ''} ${a.eventPlace ?? ''}`
  const bAddr = `${b.address?.addr1 ?? ''} ${b.eventPlace ?? ''}`
  const aIsBusan = aAddr.includes('부산')
  const bIsBusan = bAddr.includes('부산')
  if (aIsBusan === bIsBusan) return 0
  return aIsBusan ? -1 : 1
}

function festivalLatLng(f: FestivalListItem) {
  const coords = f.location?.coordinates
  if (!coords || coords.length < 2) return null
  const [lng, lat] = coords
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lat, lng }
}

export function HomePage() {
  const todayIso = useMemo(() => toIsoDate(new Date()), [])
  const nav = useNavigate()
  const [festivals, setFestivals] = useState<FestivalListItem[]>([])
  const [loadingFestivals, setLoadingFestivals] = useState(false)
  const [festivalError, setFestivalError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    setLoadingFestivals(true)
    setFestivalError(null)
    fetchMainFestivals({ date: todayIso, limit: 100 }, ac.signal)
      .then((r) => {
        const activeToday = r.festivals.filter((f) => isActiveOnDate(f, todayIso))
        activeToday.sort(isBusanFirst)
        setFestivals(activeToday)
      })
      .catch((err) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return
        setFestivalError('진행 중인 축제를 불러오지 못했어요.')
      })
      .finally(() => setLoadingFestivals(false))
    return () => ac.abort()
  }, [todayIso])

  function onFestivalClick(festival: FestivalListItem) {
    const ll = festivalLatLng(festival)
    if (!ll) return
    const qs = new URLSearchParams({
      lat: String(ll.lat),
      lng: String(ll.lng),
      contentId: festival.contentId,
    })
    nav(`/map?${qs.toString()}`)
  }

  return (
    <section className="homeLanding" aria-label="메인 페이지">
      <div className="homeLandingFold">
        <HomeLandingHeader />

        <main className="homeLandingMain">
          <section className="homeLandingHero" aria-label="소개">
            <div className="homeLandingLeft">
              <h1 className="homeLandingTitle">
                <span className="homeLandingTitleLine homeLandingTitleLineNoWrap">여행의 모든 순간을,</span>
                <span className="homeLandingTitleLine homeLandingTitleAccent">한 지도에 담다.</span>
              </h1>
              <div className="homeLandingKicker">지금 떠나는 여행을 더 쉽게, 더 똑똑하게</div>
              <p className="homeLandingDesc">Discover festivals, explore places, and build your perfect trip with ease.</p>
              <div className="homeLandingActions">
                <Link className="homeLandingButtonLink" to="/signup">
                  Register
                </Link>
              </div>
            </div>

            <div className="homeLandingRight" aria-hidden="true">
              <div className="homeLandingCards">
                <img className="homeLandingMainImage" src={mainHeroImageUrl} alt="" />
              </div>
            </div>
          </section>

          <section className="homeFeatures" aria-label="기능 소개">
            <h2 className="homeFeaturesTitle">Our Features</h2>
            <p className="homeFeaturesSub">
              지도와 달력으로 축제를 탐색하고, 핀으로 나만의 여행을 기록할 수 있어요.
            </p>

            <div className="homeFeaturesGrid">
              <article className="homeFeatureCard">
                <div className="homeFeatureIcon orange" aria-hidden="true">
                  📅
                </div>
                <div className="homeFeatureName">축제 달력</div>
                <div className="homeFeatureDesc">날짜별로 진행 중인 축제를 한눈에 확인하고, 여행 일정에 쉽게 추가하세요.</div>
                <div className="homeFeatureDesc homeFeatureDescEn">
                  Explore ongoing festivals by date and seamlessly add them to your travel plan.
                </div>
              </article>

              <article className="homeFeatureCard">
                <div className="homeFeatureIcon green" aria-hidden="true">
                  📍
                </div>
                <div className="homeFeatureName">정보 요약형 핀</div>
                <div className="homeFeatureDesc">지도 위에서 관광지와 축제 정보를 한 번에 확인하고 빠르게 선택하세요.</div>
                <div className="homeFeatureDesc homeFeatureDescEn">
                  Get key information at a glance directly on the map and choose faster.
                </div>
              </article>

              <article className="homeFeatureCard">
                <div className="homeFeatureIcon yellow" aria-hidden="true">
                  <img src={featureCalendarUrl} alt="" />
                </div>
                <div className="homeFeatureName">동시 협업</div>
                <div className="homeFeatureDesc">친구들과 지도를 공유하며 함께 여행 계획을 완성하세요.</div>
                <div className="homeFeatureDesc homeFeatureDescEn">
                  Plan your trip together with friends in real time on a shared map.
                </div>
              </article>

              <article className="homeFeatureCard">
                <div className="homeFeatureIcon blue" aria-hidden="true">
                  <img src={featureMapUrl} alt="" />
                </div>
                <div className="homeFeatureName">AI 일정 생성</div>
                <div className="homeFeatureDesc">선택한 장소를 기반으로, 최적의 여행 일정을 자동으로 구성해드립니다.</div>
                <div className="homeFeatureDesc homeFeatureDescEn">
                  Automatically generate the best travel route based on your selected places.
                </div>
              </article>
            </div>

            <div className="homeFeaturesMore">
              <Link className="homeFeaturesMoreLink" to="/calendar">
                Learn more →
              </Link>
            </div>
          </section>
        </main>
      </div>

      <div className="homeLandingAfterFold">
        <div className="homeLayout">
          <section className="homeFestivalPanel" aria-label="오늘 진행 중인 축제">
            <div className="homeSectionHeader">
              <h2 className="homeSectionTitle">오늘 진행 중인 축제</h2>
              <div className="homeSectionSub">{todayIso}</div>
            </div>

          {festivalError ? <div className="error">{festivalError}</div> : null}

          {loadingFestivals ? (
            <div className="homeState">진행 중인 축제를 불러오는 중이에요.</div>
          ) : festivals.length === 0 ? (
            <div className="homeState">오늘 진행 중인 축제가 없어요.</div>
          ) : (
            <div className="homeFestivalList">
              {festivals.map((festival) => (
                <article
                  key={festival.contentId}
                  className="homeFestivalCard"
                  role="button"
                  tabIndex={0}
                  onClick={() => onFestivalClick(festival)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onFestivalClick(festival)
                  }}
                >
                  <div className="homeFestivalThumb">
                    {festival.image ? <img src={festival.image} alt="" loading="lazy" /> : <div className="thumbFallback" />}
                  </div>
                  <div className="homeFestivalBody">
                    <h3 className="homeFestivalTitle">{festival.title}</h3>
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
          </section>
        </div>
      </div>
    </section>
  )
}