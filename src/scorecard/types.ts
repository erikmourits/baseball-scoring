import type { LocalAtBat, LocalGame, LocalGameLineup, LocalInning, LocalPlayer, LocalPitchingLine, LocalTeam } from '../db/local'

export interface PlayerStats {
  ab: number
  h: number
  r: number
  rbi: number
  bb: number
  k: number
}

export interface ScorecardData {
  isLoading: boolean
  game: LocalGame | undefined
  homeTeam: LocalTeam | undefined
  awayTeam: LocalTeam | undefined
  playersById: Map<string, LocalPlayer>
  innings: LocalInning[]
  maxInning: number
  atBatsByBatterAndInning: Map<string, Map<string, LocalAtBat[]>>
  statsMap: Map<string, PlayerStats>
  linescore: Map<number, { top: number; bottom: number }>
  awayLineup: LocalGameLineup[]
  homeLineup: LocalGameLineup[]
  pitchingLines: LocalPitchingLine[]
  halfInningMap: (half: 'top' | 'bottom') => Map<number, string>
  scoredByPlayerAndInning: Map<string, Set<string>>
  // 12.1: atBatId → which out (1|2|3) that batter was in the half-inning
  outSequenceByAtBat: Map<string, number>
  // 12.3/12.4: playerId → inningId → bases actually reached (for runner advancement)
  playerInningBasesReached: Map<string, Map<string, string[]>>
}
