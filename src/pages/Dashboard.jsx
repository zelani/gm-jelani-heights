import { useAuth } from '../AuthContext'
import AppContent from '../components/AppContent'

export default function Dashboard() {
  const { user, role, logout } = useAuth()
  const isAdmin = role === 'admin'

  return (
    <div>
      {/* Top auth bar */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-300">{user?.email}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold ${isAdmin ? 'bg-green-500' : 'bg-blue-500'}`}>
            {isAdmin ? '🔑 Admin' : '👁️ View Only'}
          </span>
        </div>
        <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold">
          Sign Out
        </button>
      </div>

      {/* View-only overlay banner for users */}
      {!isAdmin && (
        <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-2 text-center text-xs font-semibold text-yellow-700">
          👁️ You are in <strong>View-Only Mode</strong>. Contact your admin to make changes.
        </div>
      )}

      {/* Pass isAdmin prop to disable editing for non-admins */}
      <AppContent isAdmin={isAdmin} />
    </div>
  )
}