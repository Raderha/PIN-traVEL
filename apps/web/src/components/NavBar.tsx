import { Link, NavLink, useNavigate } from 'react-router-dom'
import logoUrl from '../assets/logo.png'

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

          <a className="navItem disabled" aria-disabled="true">
            <span className="navIcon" aria-hidden="true">
              🗺️
            </span>
            지도
          </a>
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

