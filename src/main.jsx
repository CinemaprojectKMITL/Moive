import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import { ErrorBoundary } from './components/common/ErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <ToastProvider>
            <AuthProvider><App /></AuthProvider>
          </ToastProvider>
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
