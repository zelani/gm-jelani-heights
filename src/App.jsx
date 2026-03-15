import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import PendingPage from './pages/PendingPage'

export default function App() {
  const { user, approved, loading, logout } = useAuth()

  if (loading) return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
      <div className="text-center text-white">
        <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
        <p className="font-semibold">Loading GM Jelani Heights...</p>
      </div>
    </div>
  )

  return (
    <Routes>
      <Route path="/login"
        element={!user ? <LoginPage /> : <Navigate to="/" />}
      />
      <Route path="/pending"
        element={user && !approved ? <PendingPage logout={logout} /> : <Navigate to={user ? "/" : "/login"} />}
      />
      <Route path="/*"
        element={
          !user     ? <Navigate to="/login"   /> :
          !approved ? <Navigate to="/pending" /> :
                      <Dashboard />
        }
      />
    </Routes>
  )
}
