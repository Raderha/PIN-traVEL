import './App.css'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { NavBar } from './components/NavBar'
import { HomePage } from './pages/HomePage'
import { FestivalCalendarPage } from './pages/FestivalCalendarPage'

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <NavBar />
        <main className="appMain">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendar" element={<FestivalCalendarPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
