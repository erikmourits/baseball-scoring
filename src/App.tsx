import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useSession } from './hooks/useSession'
import { useSync } from './hooks/useSync'
import AuthPage from './pages/AuthPage'
import HomePage from './pages/HomePage'
import TeamsPage from './pages/TeamsPage'
import TeamDetailPage from './pages/TeamDetailPage'
import PlayerFormPage from './pages/PlayerFormPage'
import SeasonsPage from './pages/SeasonsPage'
import NewGamePage from './pages/NewGamePage'
import GamePage from './pages/GamePage'
import GameSummaryPage from './pages/GameSummaryPage'
import PlayerStatsPage from './pages/PlayerStatsPage'
import StatsPage from './pages/StatsPage'
import ScorecardPage from './pages/ScorecardPage'
import ScorecardUploadPage from './pages/ScorecardUploadPage'
import ScorecardReviewPage from './pages/ScorecardReviewPage'
import WatchPage from './pages/WatchPage'
import InvitePage from './pages/InvitePage'
import LeagueSettingsPage from './pages/LeagueSettingsPage'
import AppShell from './components/layout/AppShell'
import AdminPage from './pages/AdminPage'
import SignupInvitePage from './pages/SignupInvitePage'
import HelpPage from './pages/HelpPage'

function AuthenticatedApp() {
  useSync()
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/"                                         element={<HomePage />} />
        <Route path="/teams"                                    element={<TeamsPage />} />
        <Route path="/teams/:teamId"                            element={<TeamDetailPage />} />
        <Route path="/teams/:teamId/players/:playerId"          element={<PlayerFormPage />} />
        <Route path="/teams/:teamId/players/:playerId/stats"    element={<PlayerStatsPage />} />
        <Route path="/stats"                                         element={<StatsPage />} />
        <Route path="/seasons"                                  element={<SeasonsPage />} />
        <Route path="/games/new"                                element={<NewGamePage />} />
        <Route path="/games/:gameId"                            element={<GamePage />} />
        <Route path="/games/:gameId/summary"                    element={<GameSummaryPage />} />
        <Route path="/games/:gameId/scorecard"                  element={<ScorecardPage />} />
        <Route path="/games/upload"                             element={<ScorecardUploadPage />} />
        <Route path="/games/upload/review"                      element={<ScorecardReviewPage />} />
        <Route path="/league"                                     element={<LeagueSettingsPage />} />
        <Route path="/watch/:token"                               element={<WatchPage />} />
        <Route path="/invite/:token"                              element={<InvitePage />} />
        <Route path="/league-invite/:token"                       element={<InvitePage />} />
        <Route path="/admin"                                    element={<AdminPage />} />
        <Route path="/help"                                     element={<HelpPage />} />
        <Route path="*"                                         element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="w-8 h-8 border-4 border-brand-500 dark:border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      {session ? (
        <AuthenticatedApp />
      ) : (
        <Routes>
          <Route path="/auth"          element={<AuthPage />} />
          <Route path="/watch/:token"         element={<WatchPage />} />
          <Route path="/league-invite/:token" element={<InvitePage />} />
          <Route path="/signup/:token"        element={<SignupInvitePage />} />
          <Route path="*"              element={<Navigate to="/auth" replace />} />
        </Routes>
      )}
    </BrowserRouter>
  )
}
