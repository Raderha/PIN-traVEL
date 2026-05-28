import { useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/logo.png'
import { createSession, logout } from '../lib/api'
import { clearPintravelClientStorage } from '../lib/clearPintravelStorage'
import { copyTextToClipboard } from '../lib/copyToClipboard'
import { resolveShareableOrigin } from '../lib/shareableOrigin'

export function NavBar() {
  const nav = useNavigate()
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null))

  async function onLogout() {
    try {
      await logout()
    } catch {
      // 서버 로그 목적이므로 실패해도 로컬 로그아웃은 진행
    }
    clearPintravelClientStorage()
    setToken(null)
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

          {token ? (
            <NavLink to="/mypage" className={({ isActive }) => `navItem ${isActive ? 'active' : ''}`}>
              마이페이지
            </NavLink>
          ) : null}
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
  const [token, setToken] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null))
  const [sessionUrl, setSessionUrl] = useState<string | null>(null)
  const [creatingSession, setCreatingSession] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [sessionCopyDone, setSessionCopyDone] = useState(false)
  const [sessionCopyManual, setSessionCopyManual] = useState(false)
  const sessionUrlInputRef = useRef<HTMLInputElement>(null)

  async function onLogout() {
    try {
      await logout()
    } catch {
      // ignore
    }
    clearPintravelClientStorage()
    setToken(null)
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
      const origin = await resolveShareableOrigin()
      const url = `${origin}/map?session=${encodeURIComponent(r.sessionId)}`
      setSessionCopyDone(false)
      setSessionCopyManual(false)
      setSessionUrl(url)
      /** 호스트도 같은 세션 room에 들어가야 지도·커서를 보낼 수 있음 */
      nav(`/map?session=${encodeURIComponent(r.sessionId)}`)
    } catch {
      setSessionError('세션 생성에 실패했어요.')
    } finally {
      setCreatingSession(false)
    }
  }

  async function onCopySessionUrl() {
    if (!sessionUrl) return
    const ok = await copyTextToClipboard(sessionUrl)
    if (ok) {
      setSessionCopyManual(false)
      setSessionCopyDone(true)
      window.setTimeout(() => setSessionCopyDone(false), 2200)
      return
    }
    setSessionCopyManual(true)
    const input = sessionUrlInputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }

  return (
    <header className="mapNavWrap">
      <nav className="mapNav">
        <Link className="brand mapBrand" to="/">
          <span className="mapBrandText">PIN-traVEL</span>
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
            {sessionUrl.includes('localhost') || sessionUrl.includes('127.0.0.1') ? (
              <p className="sessionModalHint">
                다른 기기에서는 이 주소로 접속할 수 없어요. 브라우저 주소창에 PC의 Wi‑Fi IP(예: 192.168.0.10:5173)로
                연 뒤 세션을 다시 만들어 주세요.
              </p>
            ) : null}
            <input
              ref={sessionUrlInputRef}
              className="sessionUrlInput"
              type="text"
              readOnly
              value={sessionUrl}
              aria-label="세션 초대 URL"
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
            />
            {sessionCopyDone ? <p className="sessionCopyOk">클립보드에 복사했어요.</p> : null}
            {sessionCopyManual ? (
              <p className="sessionModalHint">자동 복사가 안 되면 위 주소를 길게 눌러 전체 선택 후 복사해 주세요.</p>
            ) : null}
            <div className="sessionModalActions">
              <button type="button" onClick={() => void onCopySessionUrl()}>
                {sessionCopyDone ? '복사됨' : '복사하기'}
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

