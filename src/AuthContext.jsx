import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from './firebase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [flatNumber, setFlatNumber] = useState(null)
  const [userName, setUserName] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const ref = doc(db, 'users', firebaseUser.uid)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          await setDoc(ref, { email: firebaseUser.email, role: 'user' })
          setRole('user')
          setFlatNumber(null)
          setUserName(null)
        } else {
          const data = snap.data()
          setRole(data.role || 'user')
          setFlatNumber(data.flatNumber || null)
          setUserName(data.name || firebaseUser.email)
        }
        setUser(firebaseUser)
      } else {
        setUser(null)
        setRole(null)
        setFlatNumber(null)
        setUserName(null)
      }
      setLoading(false)
    })
  }, [])

  const logout = () => signOut(auth)

  return (
    <AuthContext.Provider value={{ user, role, flatNumber, userName, loading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
