import { useAuth } from '../AuthContext'
import AppContent from '../components/AppContent'

export default function Dashboard() {
  const { user, role, flatNumber, userName, logout } = useAuth()
  const isAdmin = role === 'admin'
  const isResident = role === 'resident'

  return (
    <div>
      {/* Top auth bar */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-300">{user?.email}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold ${
            isAdmin ? 'bg-green-500' :
            isResident ? 'bg-blue-500' :
            'bg-gray-500'
          }`}>
            {isAdmin ? '🔑 Admin' : isResident ? '🏠 Resident' : '👁️ View Only'}
          </span>
          {isResident && flatNumber && (
            <span className="text-gray-400">Flat {flatNumber}</span>
          )}
        </div>
        <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold">
          Sign Out
        </button>
      </div>

      {/* View-only banner for non-admins */}
      {!isAdmin && !isResident && (
        <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-2 text-center text-xs font-semibold text-yellow-700">
          👁️ You are in <strong>View-Only Mode</strong>. Contact your admin to make changes.
        </div>
      )}

      {/* Resident welcome banner */}
      {isResident && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-center text-xs font-semibold text-blue-700">
          🏠 Welcome, {userName} — Flat {flatNumber}
        </div>
      )}

      <AppContent
        isAdmin={isAdmin}
        role={role || 'user'}
        flatNumber={flatNumber}
        currentUser={userName || user?.email}
      />
    </div>
  )
}
