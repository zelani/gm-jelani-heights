import { useState, useEffect } from 'react'
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '../firebase'

const ROLE_COLORS = {
  admin:    "bg-purple-100 text-purple-700",
  resident: "bg-blue-100 text-blue-700",
  auditor:  "bg-teal-100 text-teal-700",
  guest:    "bg-gray-100 text-gray-600",
}

export default function UserApprovalsPanel() {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('pending') // 'pending' | 'approved' | 'all'

  async function loadUsers() {
    setLoading(true)
    try {
      const snap = await getDocs(collection(db, 'users'))
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      // Sort: pending first, then by createdAt desc
      list.sort((a, b) => {
        if (a.approved === b.approved) {
          return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        }
        return a.approved ? 1 : -1
      })
      setUsers(list)
    } catch (e) {
      console.error('Error loading users:', e)
    }
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  async function approve(uid) {
    try {
      await updateDoc(doc(db, 'users', uid), { approved: true })
      setUsers(us => us.map(u => u.id === uid ? { ...u, approved: true } : u))
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function reject(uid, email) {
    if (!window.confirm(`Reject and delete account for ${email}? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'users', uid))
      setUsers(us => us.filter(u => u.id !== uid))
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function changeRole(uid, newRole) {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole })
      setUsers(us => us.map(u => u.id === uid ? { ...u, role: newRole } : u))
    } catch (e) { alert('Error: ' + e.message) }
  }

  async function revokeAccess(uid) {
    if (!window.confirm('Revoke access? The user will be blocked until re-approved.')) return
    try {
      await updateDoc(doc(db, 'users', uid), { approved: false })
      setUsers(us => us.map(u => u.id === uid ? { ...u, approved: false } : u))
    } catch (e) { alert('Error: ' + e.message) }
  }

  const pending  = users.filter(u => !u.approved)
  const approved = users.filter(u => u.approved)
  const visible  = filter === 'pending' ? pending : filter === 'approved' ? approved : users

  function fmtDate(ts) {
    if (!ts) return '—'
    const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts)
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-5">

      {/* Stats + filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-2 text-center">
            <p className="text-xl font-bold text-orange-600">{pending.length}</p>
            <p className="text-xs text-orange-500 font-semibold">Pending</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2 text-center">
            <p className="text-xl font-bold text-green-600">{approved.length}</p>
            <p className="text-xs text-green-500 font-semibold">Approved</p>
          </div>
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-center">
            <p className="text-xl font-bold text-gray-600">{users.length}</p>
            <p className="text-xs text-gray-500 font-semibold">Total</p>
          </div>
        </div>
        <div className="flex gap-2">
          {[['pending','⏳ Pending'],['approved','✅ Approved'],['all','All']].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={"px-3 py-1.5 rounded-lg text-xs font-bold transition " +
                (filter === v ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200")}
            >{l}</button>
          ))}
          <button onClick={loadUsers}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* User list */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"/>
        </div>
      )}

      {!loading && visible.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">{filter === 'pending' ? '🎉' : '👥'}</p>
          <p className="font-semibold">
            {filter === 'pending' ? 'No pending approvals' : 'No users found'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map(u => (
          <div key={u.id}
            className={"bg-white rounded-2xl border shadow-sm overflow-hidden " +
              (!u.approved ? "border-orange-200" : "border-gray-100")}
          >
            {/* Top bar — pending indicator */}
            {!u.approved && (
              <div className="bg-orange-50 border-b border-orange-200 px-4 py-1.5 flex items-center gap-2">
                <span className="text-xs font-bold text-orange-600">⏳ AWAITING APPROVAL</span>
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">

                {/* User info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-gray-800 text-sm">{u.fullName || u.name || '—'}</h3>
                    <span className={"text-xs px-2 py-0.5 rounded-full font-semibold " + (ROLE_COLORS[u.role] || ROLE_COLORS.guest)}>
                      {u.role || 'resident'}
                    </span>
                    {u.flatNumber && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-semibold">
                        Flat {u.flatNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  {u.phone && <p className="text-xs text-gray-400 mt-0.5">📞 +91 {u.phone}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                    {u.referredBy && (
                      <p className="text-xs text-indigo-600 font-semibold">
                        👤 Referred by: {u.referredBy}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">
                      📅 Registered: {fmtDate(u.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {!u.approved ? (
                    <div className="flex gap-2">
                      <button onClick={() => approve(u.id)}
                        className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition">
                        ✓ Approve
                      </button>
                      <button onClick={() => reject(u.id, u.email)}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-xs font-bold hover:bg-red-200 transition">
                        ✗ Reject
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={u.role || 'resident'}
                        onChange={e => changeRole(u.id, e.target.value)}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700"
                      >
                        <option value="resident">Resident</option>
                        <option value="admin">Admin</option>
                        <option value="auditor">Auditor</option>
                        <option value="guest">Guest</option>
                      </select>
                      <button onClick={() => revokeAccess(u.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-red-50 hover:text-red-600 transition">
                        Revoke
                      </button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
