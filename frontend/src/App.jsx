import { Routes, Route, useLocation } from 'react-router-dom'
import LoadError from './components/LoadError'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import MovieDetailPage from './pages/MovieDetailPage'
import BookingPage from './pages/BookingPage'

export default function App() {
  const location = useLocation()
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"           element={<HomePage />} />
        <Route path="/movie/:id"  element={<MovieDetailPage />} />
        <Route path="/booking/:id/:showtime" element={<BookingPage key={location.pathname} />} />
        <Route path="*" element={<LoadError message="Page not found." />} />
      </Routes>
    </>
  )
}
