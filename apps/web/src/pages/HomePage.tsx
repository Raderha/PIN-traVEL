import { Link } from 'react-router-dom'

export function HomePage() {
  return (
    <section className="page">
      <div className="card">
        <h1 className="pageTitle">PinTravel</h1>
        <p className="pageSub">
          상단 네비게이션에서 <b>축제 달력</b>로 이동해 주세요.
        </p>
        <div className="actions">
          <Link className="primaryBtn" to="/calendar">
            축제 달력 열기
          </Link>
        </div>
      </div>
    </section>
  )
}

