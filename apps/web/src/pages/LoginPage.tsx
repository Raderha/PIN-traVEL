import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../lib/api'
import blossomsUrl from '../assets/blossoms.png'
import gyeongbokgungUrl from '../assets/gyeongbokgung.png'

function UserIcon() {
  return (
    <svg className="loginFieldSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg className="loginFieldSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
    </svg>
  )
}

export function LoginPage() {
  const nav = useNavigate()
  const loc = useLocation()
  const nextPath = useMemo(() => {
    const qs = new URLSearchParams(loc.search)
    return qs.get('next') ?? '/'
  }, [loc.search])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const r = await login({ username: username.trim(), password })
      localStorage.setItem('pintravel_token', r.token)
      localStorage.setItem('pintravel_user', JSON.stringify(r.user))
      nav(nextPath, { replace: true })
    } catch {
      setError('아이디 또는 비밀번호가 올바르지 않아요.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="loginPage" aria-label="로그인">
      <img className="loginDecor loginDecorBlossoms" src={blossomsUrl} alt="" />
      <img className="loginDecor loginDecorPalace" src={gyeongbokgungUrl} alt="" />

      <div className="loginInner">
        <div className="loginBrand">
          <Link className="loginLogoText" to="/">
            PIN-traVEL
          </Link>
        </div>

        <p className="loginGreeting">어디로 떠나볼까요?</p>

        {error ? <div className="loginError">{error}</div> : null}

        <form className="loginForm" onSubmit={onSubmit}>
          <div className="loginField">
            <span className="loginFieldIcon" aria-hidden>
              <UserIcon />
            </span>
            <input
              className="loginInput"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              placeholder="Username"
              required
            />
          </div>

          <div className="loginField">
            <span className="loginFieldIcon" aria-hidden>
              <LockIcon />
            </span>
            <input
              className="loginInput"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Password"
              required
            />
          </div>

          <button type="submit" className="loginSubmit" disabled={submitting}>
            {submitting ? '로그인 중…' : 'Login Now'}
          </button>
        </form>

        <p className="loginSignupLine">
          아직 계정이 없으신가요?{' '}
          <Link to="/signup" className="loginSignupLink">
            회원가입
          </Link>
        </p>
      </div>
    </section>
  )
}
