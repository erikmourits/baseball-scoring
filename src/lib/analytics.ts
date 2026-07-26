import posthog from 'posthog-js'

export type AnalyticsEvent =
  | '$pageview'
  | 'auth_login'
  | 'auth_logout'
  | 'auth_password_reset_requested'
  | 'auth_password_reset_completed'
  | 'auth_password_changed'
  | 'game_created'
  | 'game_deleted'
  | 'game_scoring_event'
  | 'sync_error'
  | 'sync_offline'
  | 'team_created'
  | 'player_created'
  | 'scorecard_upload_started'
  | 'scorecard_review_submitted'

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined
  if (!key) return
  posthog.init(key, {
    api_host:
      (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
      'https://eu.i.posthog.com',
    person_profiles: 'identified_only',
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
  })
}

export const analytics = {
  identify(userId: string, properties?: Record<string, unknown>): void {
    posthog.identify(userId, properties)
  },
  reset(): void {
    posthog.reset()
  },
  track(event: AnalyticsEvent, properties?: Record<string, unknown>): void {
    posthog.capture(event, properties)
  },
  captureException(error: unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error ? error : new Error(String(error))
    posthog.captureException(err, context)
  },
}
