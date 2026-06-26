import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import App from './App'
import './index.css'
import './i18n'
import { syncAll } from './services/sync'

// Exposed for E2E tests so Playwright can force-flush dirty records to Supabase.
// Returns { errors } so the test can assert a clean sync.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__forceSync = async () => {
    const errors: string[] = []
    const orig = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      errors.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
      orig(...args)
    }
    try {
      await syncAll()
    } finally {
      console.error = orig
    }
    return { errors }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
