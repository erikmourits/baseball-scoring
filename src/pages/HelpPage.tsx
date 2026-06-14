import { useNavigate } from 'react-router-dom'

const SECTIONS = [
  {
    emoji: '🏆',
    title: 'Getting started',
    items: [
      'Create a league — a league holds your teams, seasons, and games.',
      'Add teams and their rosters under the Teams tab.',
      'Create a season and mark it active under the Seasons tab.',
      'Tap + New game on the Games screen to start scoring.',
    ],
  },
  {
    emoji: '⚾',
    title: 'Scoring a game',
    items: [
      '1B  2B  3B  HR — base hits and home run.',
      'BB — base on balls (walk).  HBP — hit by pitch.',
      'K — strikeout.  FO — fly out.  GDP — grounded into double play.',
      'RoE — reached on error.  FC — fielder\'s choice.',
      'SAC — sacrifice bunt.  SF — sacrifice fly.',
      'After each result, select the fielders involved (1–9 grid).',
      'Move runners on the base diamond after each at-bat.',
      'SB  CS  WP  PB  BALK — use the between-at-bat buttons on the base diamond screen.',
      'Tap Undo at any time to step back.',
    ],
  },
  {
    emoji: '📷',
    title: 'Scorecard OCR',
    items: [
      'Tap the 📷 button on the Games screen to upload a photo of a written KNBSB scorecard.',
      'The app sends the image to an AI model which reads the scorecard and imports the at-bats.',
      'Review each inning on the review screen before saving — you can correct any mistakes.',
      'OCR costs roughly €0.01–0.02 per scorecard.',
    ],
  },
  {
    emoji: '📊',
    title: 'Statistics',
    items: [
      'Stats are computed live from the game log — no manual entry needed.',
      'Batting: AVG, OBP, SLG, OPS, H, HR, RBI, BB, K and more.',
      'Pitching: ERA, WHIP, IP, W, L, K, BB and more.',
      'View stats per player or per team under the Stats tab.',
    ],
  },
  {
    emoji: '🔄',
    title: 'Sync & offline',
    items: [
      'The app works offline — all data is stored on your device first.',
      'Changes sync to the server automatically when you\'re back online.',
      'A sync indicator appears at the top of the screen if there are unsaved changes.',
      'Use League Settings → Troubleshooting → Clear local data if something looks out of sync.',
    ],
  },
  {
    emoji: '👥',
    title: 'Inviting scorers',
    items: [
      'Go to League Settings and tap Invite scorer to generate an invite link.',
      'Share the link with the scorer — they log in and are added to your league automatically.',
      'Scorers can view and score games but cannot manage league settings.',
    ],
  },
]

export default function HelpPage() {
  const navigate = useNavigate()
  return (
    <div className="p-4 pb-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate(-1)} className="text-brand-500 dark:text-brand-100 text-sm font-medium">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Help</h1>
      </div>
      <div className="space-y-6">
        {SECTIONS.map(s => (
          <div key={s.title}>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {s.emoji} {s.title}
            </h2>
            <ul className="space-y-1.5">
              {s.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                  <span className="text-gray-300 dark:text-gray-600 mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
