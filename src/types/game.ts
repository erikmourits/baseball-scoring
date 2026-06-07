export type Bases    = { first?: string; second?: string; third?: string }
export type BaseKey  = 'first' | 'second' | 'third'
export type RunnerDest = 'hold' | 'second' | 'third' | 'score' | 'out'

export type GameSnapshot = {
  inningNumber: number
  half: 'top' | 'bottom'
  outs: number
  awayBatterIndex: number
  homeBatterIndex: number
  bases: Bases
  homeScore: number
  awayScore: number
}

export type HistoryEntry = {
  snapshot: GameSnapshot
  atBatId?: string
  inningId?: string
}

export type BetweenEvent = 'SB' | 'CS' | 'WP' | 'PB' | 'BALK'
