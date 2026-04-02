import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { NavBar } from './components/NavBar'
import { HomePage } from './pages/HomePage'
import { FestivalCalendarPage } from './pages/FestivalCalendarPage'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <NavBar />
        <main className="appMain">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendar" element={<FestivalCalendarPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
