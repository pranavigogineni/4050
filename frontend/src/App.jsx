import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import MovieDetailPage from './pages/MovieDetailPage'
import BookingPage from './pages/BookingPage'

export default function App() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/"           element={<HomePage />} />
        <Route path="/movie/:id"  element={<MovieDetailPage />} />
        <Route path="/booking/:id/:showtime" element={<BookingPage />} />
      </Routes>
    </>
  )
}
