import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div style={{ display: 'flex', gap: 24, marginBottom: 24 }}>
        <a href="https://vite.dev" target="_blank" rel="noopener noreferrer">
          <img src={viteLogo} style={{ width: 80, height: 80 }} alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank" rel="noopener noreferrer">
          <img src={reactLogo} style={{ width: 80, height: 80 }} alt="React logo" />
        </a>
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 700, marginBottom: 24 }}>Vite + React</h1>
      <div
        style={{
          background: '#18181b',
          padding: 24,
          borderRadius: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          marginBottom: 24,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center'
        }}
      >
        <button
          onClick={() => setCount((count) => count + 1)}
          style={{
            background: '#222',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            padding: '12px 24px',
            fontSize: 18,
            cursor: 'pointer',
            marginBottom: 16
          }}
        >
          count is {count}
        </button>
        <p>
          Edit{' '}
          <code style={{ background: '#222', padding: '2px 6px', borderRadius: 4 }}>
            src/App.tsx
          </code>{' '}
          and save to test HMR
        </p>
      </div>
      <p style={{ opacity: 0.7, fontSize: 16 }}>Click on the Vite and React logos to learn more</p>
    </div>
  )
}

export default App
