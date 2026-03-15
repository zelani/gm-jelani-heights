import { useState } from 'react'
import { useAuth } from '../AuthContext'
import AppContent from '../components/AppContent'
import UserApprovalsPanel from '../components/UserApprovalsPanel'

export default function Dashboard() {
  const { user, role, flatNumber, userName, logout } = useAuth()
  const [showUsers, setShowUsers] = useState(false)

  const isAdmin    = role === 'admin'
  const isResident = role === 'resident'

  return (
    <div>
      {/* Top auth bar */}
      <div className="bg-gray-800 text-white px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-300">{user?.email}</span>
          <span className={`px-2 py-0.5 rounded-full font-bold ${
            isAdmin    ? 'bg-green-500' :
            isResident ? 'bg-blue-500'  :
                         'bg-gray-500'
          }`}>
            {isAdmin ? '🔑 Admin' : isResident ? '🏠 Resident' : '👁️ View Only'}
          </span>
          {isResident && flatNumber && (
            <span className="text-gray-400">Flat {flatNumber}</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Users / Approvals button — admin only */}
          {isAdmin && (
            <button
              onClick={() => setShowUsers(v => !v)}
              className={`px-3 py-1 rounded font-semibold transition ${
                showUsers
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-gray-600 hover:bg-gray-500'
              }`}
            >
              👥 Users
            </button>
          )}
          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded font-semibold"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* View-only banner */}
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

      {/* User Approvals Panel — slides in when admin clicks 👥 Users */}
      {isAdmin && showUsers && (
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-gray-800">👥 User Management</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Approve or reject pending registrations, change roles, revoke access
                </p>
              </div>
              <button
                onClick={() => setShowUsers(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold leading-none"
              >
                ×
              </button>
            </div>
            <UserApprovalsPanel />
          </div>
        </div>
      )}

      {/* Main app */}
      <AppContent
        isAdmin={isAdmin}
        role={role || 'user'}
        flatNumber={flatNumber}
        currentUser={userName || user?.email}
      />
    </div>
  )
}
