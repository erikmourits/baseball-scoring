import { Component, ErrorInfo, ReactNode } from 'react'
import { analytics } from '../lib/analytics'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    analytics.captureException(error, {
      componentStack: info.componentStack ?? undefined,
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-8 text-center bg-gray-50 dark:bg-gray-900">
          <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Something went wrong
          </p>
          <p className="text-gray-600 dark:text-gray-400 max-w-sm">
            An unexpected error occurred. The error has been reported.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 dark:bg-blue-700 dark:hover:bg-blue-600"
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
