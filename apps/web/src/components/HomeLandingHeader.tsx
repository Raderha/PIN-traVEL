import { Link, NavLink } from 'react-router-dom'

export function HomeLandingHeader() {
  return (
    <header className="homeLandingHeader" aria-label="상단 메뉴">
      <Link className="homeLandingBrand" to="/">
        PIN-traVEL
      </Link>

      <nav className="homeLandingNav" aria-label="메인 메뉴">
        <NavLink end className="homeLandingNavItem" to="/">
          Features
        </NavLink>
        <NavLink className="homeLandingNavItem" to="/calendar">
          축제 달력
        </NavLink>
        <NavLink className="homeLandingNavItem" to="/map">
          지도
        </NavLink>
      </nav>

      <Link className="homeLandingCta homeLandingCtaGreen" to="/login">
        Sign in →
      </Link>
    </header>
  )
}
