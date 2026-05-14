import { Link, NavLink, useNavigate } from 'react-router-dom'

import { clearPintravelClientStorage } from '../lib/clearPintravelStorage'

export function HomeLandingHeader() {
  const nav = useNavigate()
  const token = typeof window !== 'undefined' ? localStorage.getItem('pintravel_token') : null

  function onLogout() {
    clearPintravelClientStorage()
    nav('/', { replace: true })
  }

  return (
    <header className="homeLandingHeader" aria-label="상단 메뉴">
      <Link className="homeLandingBrand" to="/">
        PIN-traVEL
      </Link>

      <nav className="homeLandingNav" aria-label="메인 메뉴">
        <NavLink end className="homeLandingNavItem" to="/">
          Home
        </NavLink>
        <NavLink className="homeLandingNavItem" to="/calendar">
          축제 달력
        </NavLink>
        <NavLink className="homeLandingNavItem" to="/map">
          지도
        </NavLink>
      </nav>

      {token ? (
        <button type="button" className="homeLandingCta homeLandingCtaGreen" onClick={onLogout}>
          로그아웃
        </button>
      ) : (
        <Link className="homeLandingCta homeLandingCtaGreen" to="/login">
          Sign in →
        </Link>
      )}
    </header>
  )
}
