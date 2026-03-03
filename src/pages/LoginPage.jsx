import { useState } from 'react'
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth'
import { auth } from '../firebase'
import { Home } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isRegister) {
        await createUserWithEmailAndPassword(auth, email, password)
      } else {
        await signInWithEmailAndPassword(auth, email, password)
      }
    } catch (err) {
      setError(err.message.replace('Firebase: ', '').replace(/\(auth.*\)/, ''))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Home size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">GM Jelani Heights</h1>
          <p className="text-gray-500 text-sm mt-1">Apartment Management Portal</p>
        </div>

        {/* Role Info Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 text-xs text-blue-700 text-center">
          <p><strong>Admin</strong> — Full read & write access</p>
          <p><strong>User/Resident</strong> — View-only access</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@email.com" required
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}
          <button onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="text-blue-600 font-semibold ml-1 hover:underline">
            {isRegister ? 'Sign In' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}