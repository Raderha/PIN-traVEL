import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from '../lib/api'
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

function MailIcon() {
  return (
    <svg className="loginFieldSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function isValidPassword(pw: string) {
  return pw.length >= 8
}

export function SignupPage() {
  const nav = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const u = username.trim()
    const em = email.trim()
    if (!isValidPassword(password)) {
      setError('비밀번호는 8글자 이상이어야 해요.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await signup({ username: u, password, email: em })
      nav('/login', { replace: true })
    } catch (e2) {
      setError('회원가입에 실패했어요. (이미 사용 중인 아이디입니다)')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="loginPage signupPage" aria-label="회원가입">
      <img className="loginDecor loginDecorBlossoms" src={blossomsUrl} alt="" />
      <img className="loginDecor loginDecorPalace" src={gyeongbokgungUrl} alt="" />

      <div className="loginInner">
        <div className="loginBrand">
          <Link className="loginLogoText" to="/">
            PIN-traVEL
          </Link>
        </div>

        <p className="loginGreeting">회원가입</p>

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
              autoComplete="new-password"
              placeholder="Password"
              required
            />
          </div>

          <div className="loginField">
            <span className="loginFieldIcon" aria-hidden>
              <MailIcon />
            </span>
            <input
              className="loginInput"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="Email"
              required
            />
          </div>

          <button type="submit" className="loginSubmit" disabled={submitting}>
            {submitting ? '가입 중…' : '회원가입'}
          </button>
        </form>

        <p className="loginSignupLine">
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className="loginSignupLink">
            로그인
          </Link>
        </p>
      </div>
    </section>
  )
}

