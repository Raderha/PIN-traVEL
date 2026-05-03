import './App.css'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'

import { HomeLandingHeader } from './components/HomeLandingHeader'
import { MapNavBar, NavBar } from './components/NavBar'
import { HomePage } from './pages/HomePage'
import { FestivalCalendarPage } from './pages/FestivalCalendarPage'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { SignupPage } from './pages/SignupPage'

function AppLayout() {
  const location = useLocation()
  const isMapPage = location.pathname === '/map'
  const isHomePage = location.pathname === '/'
  const isCalendarPage = location.pathname === '/calendar'
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup'

  return (
    <div className="app">
      {isMapPage ? (
        <MapNavBar />
      ) : isAuthPage ? (
        <div className="landingNavShell">
          <HomeLandingHeader />
        </div>
      ) : isHomePage || isCalendarPage ? null : (
        <NavBar />
      )}
      <main className="appMain">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/calendar" element={<FestivalCalendarPage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  )
}

export default App
