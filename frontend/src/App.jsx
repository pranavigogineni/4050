import { Routes, Route, useLocation } from 'react-router-dom'
import LoadError from './components/LoadError'
import Navbar from './components/Navbar'
import HomePage from './pages/HomePage'
import MovieDetailPage from './pages/MovieDetailPage'
import BookingPage from './pages/BookingPage'
import { AuthProvider, Protected } from './auth/AuthContext'
import { RegisterPage, LoginPage, RecoveryPage, TokenPage } from './pages/AuthPages'
import ProfilePage from './pages/ProfilePage'
import AdminPage from './pages/AdminPage'

export default function App() {
  const location = useLocation()
  return (
    <AuthProvider>
      <Navbar />
      <Routes>
        <Route path="/"           element={<HomePage />} />
        <Route path="/movie/:id"  element={<MovieDetailPage />} />
        <Route path="/booking/:id/:showtime" element={<BookingPage key={location.pathname} />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<RecoveryPage key="reset" />} />
        <Route path="/resend-verification" element={<RecoveryPage key="verify" verification />} />
        <Route path="/verify-email" element={<TokenPage key="verify-token" verification />} />
        <Route path="/reset-password" element={<TokenPage key="reset-token" />} />
        <Route path="/profile" element={<Protected><ProfilePage /></Protected>} />
        <Route path="/admin" element={<Protected admin><AdminPage /></Protected>} />
        <Route path="*" element={<LoadError message="Page not found." />} />
      </Routes>
    </AuthProvider>
  )
}
