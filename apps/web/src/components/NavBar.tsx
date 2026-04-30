import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/logo.png'
import { createSession } from '../lib/api'

export function NavBar() {
  const nav = useNavigate()
  const token = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null

  function onLogout() {
    localStorage.removeItem('pintravel_token')
    localStorage.removeItem('pintravel_user')
    nav('/', { replace: true })
  }

  return (
    <header className="navWrap">
      <nav className="nav">
        <Link className="brand" to="/">
          <img className="brandLogo" src={logoUrl} alt="PIN-TRAVEL" />
        </Link>

        <div className="navLinks">
          <NavLink
            to="/calendar"
            className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}
          >
            <span className="navIcon" aria-hidden="true">
              📅
            </span>
            축제 달력
          </NavLink>

          <NavLink to="/map" className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}>
            <span className="navIcon" aria-hidden="true">
              🗺️
            </span>
            지도
          </NavLink>
        </div>

        <div className="navRight">
          {token ? (
            <button type="button" className="navItem navBtn" onClick={onLogout}>
              로그아웃
            </button>
          ) : (
            <NavLink to="/login" className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}>
              로그인
            </NavLink>
          )}
        </div>
      </nav>
      <div className="navDivider" />
    </header>
  )
}

export function MapNavBar() {
  const nav = useNavigate()
  const token = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null
  const [sessionUrl, setSessionUrl] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  function onLogout() {
    localStorage.removeItem('pintravel_token')
    localStorage.removeItem('pintravel_user')
    nav('/', { replace: true })
  }

  function onToggleFestivalFilter() {
    window.dispatchEvent(new Event('pintravel:toggle-festival-filter'))
  }

  async function onCreateSession() {
    if (!token) {
      nav(`/login?next=${encodeURIComponent('/map')}`)
      return
    }

    setCreatingSession(true)
    setSessionError(null)
    try {
      const r = await createSession()
      setSessionUrl(`${window.location.origin}/map?session=${encodeURIComponent(r.sessionId)}`)
    } catch {
      setSessionError('세션 생성에 실패했어요.')
    } finally {
      setCreatingSession(false)
    }
  }

  async function onCopySessionUrl() {
    if (!sessionUrl) return
    await navigator.clipboard?.writeText(sessionUrl)
  }

  return (
    <header className="mapNavWrap">
      <nav className="mapNav">
        <Link className="brand mapBrand" to="/">
          <img className="brandLogo" src={logoUrl} alt="PIN-TRAVEL" />
        </Link>

        <div className="mapNavControls">
          <button className="mapFilterToggle" type="button" onClick={onToggleFestivalFilter}>
            축제 필터링 <span aria-hidden="true">⌃</span>
          </button>

          <div className="mapSearch">
            <span className="mapSearchMenu" aria-hidden="true">
              ☰
            </span>
            <input aria-label="지도 검색" placeholder="어디로 떠나볼까요?" />
            <span className="mapSearchIcon" aria-hidden="true">
              ⌕
            </span>
          </div>
        </div>

        <div className="mapNavRight">
          {token ? (
            <button type="button" className="navItem navBtn" onClick={onLogout}>
              로그아웃
            </button>
          ) : (
            <NavLink to="/login" className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}>
              로그인
            </NavLink>
          )}
          <button type="button" className="navItem navBtn" onClick={onCreateSession} disabled={creatingSession}>
            {creatingSession ? '생성 중' : '세션 생성'}
          </button>
        </div>
      </nav>
      {sessionUrl ? (
        <div className="sessionModalBackdrop" role="presentation">
          <div className="sessionModal" role="dialog" aria-modal="true" aria-label="세션 생성 성공">
            <div className="sessionModalCheck" aria-hidden="true">✓</div>
            <h2>세션 생성 성공</h2>
            <div className="sessionUrlBox">{sessionUrl}</div>
            <div className="sessionModalActions">
              <button type="button" onClick={onCopySessionUrl}>
                복사하기
              </button>
              <button type="button" onClick={() => setSessionUrl(null)}>
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {sessionError ? (
        <div className="sessionToast" role="status">
          {sessionError}
        </div>
      ) : null}
    </header>
  )
}

