import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { LangProvider } from './i18n/index.ts'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </React.StrictMode>,
)
