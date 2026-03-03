// function App() {
//   const [count, setCount] = useState(0)

//   return (
//     <>
//       <div>
//         <a href="https://vite.dev" target="_blank">
//           <img src={viteLogo} className="logo" alt="Vite logo" />
//         </a>
//         <a href="https://react.dev" target="_blank">
//           <img src={reactLogo} className="logo react" alt="React logo" />
//         </a>
//       </div>
//       <h1>Vite + React</h1>
//       <div className="card">
//         <button onClick={() => setCount((count) => count + 1)}>
//           count is {count}
//         </button>
//         <p>
//           Edit <code>src/App.jsx</code> and save to test HMR
//         </p>
//       </div>
//       <p className="read-the-docs">
//         Click on the Vite and React logos to learn more
//       </p>
//     </>
//   )
// }

// export default App
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <div>Loading GM Jelani Heights...</div>

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" />} />
      <Route path="/*" element={user ? <Dashboard /> : <Navigate to="/login" />} />
    </Routes>
  )
}