import type { Bases, BaseKey, RunnerDest } from '../types/game'

// ── Result sets ───────────────────────────────────────────────────────────────

export const OUTS_RESULTS = new Set(['K', 'KL', 'FO', 'GO', 'SAC', 'SF', 'GDP'])
export const RUNNER_OUTCOME_RESULTS = new Set(['1B', '2B', '3B', 'ROE', 'FC', 'SAC', 'SF'])

// ── Runner-outcome config ──────────────────────────────────────────────────────

export const RUNNER_OPTIONS: Record<BaseKey, RunnerDest[]> = {
  first:  ['hold', 'second', 'third', 'score'],
  second: ['hold', 'third', 'score'],
  third:  ['hold', 'score'],
}

export const DEST_LABEL: Record<RunnerDest, string> = {
  hold:   'Held',
  second: '→ 2nd',
  third:  '→ 3rd',
  score:  '→ Scored',
  out:    'Out',
}

// Base the batter occupies after the result (undefined = batter is out or scores)
export const BATTER_DEST: Partial<Record<string, BaseKey>> = {
  '1B': 'first', '2B': 'second', '3B': 'third', 'ROE': 'first', 'FC': 'first',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const now = () => new Date().toISOString()

export function outsFromResult(result: string): number {
  if (result === 'GDP') return 2
  if (OUTS_RESULTS.has(result)) return 1
  return 0
}

export function advanceBasesForWalk(prev: Bases, batterId: string | undefined): Bases {
  const next = { ...prev }
  if (!prev.first)  { next.first = batterId; return next }
  if (!prev.second) { next.second = prev.first; next.first = batterId; return next }
  if (!prev.third)  { next.third = prev.second; next.second = prev.first; next.first = batterId; return next }
  next.third = prev.second; next.second = prev.first; next.first = batterId
  return next
}

export function defaultOutcomes(result: string, bases: Bases): Record<string, RunnerDest> {
  const o: Record<string, RunnerDest> = {}
  if (result === '1B' || result === 'ROE' || result === 'FC') {
    if (bases.third)  o[bases.third]  = 'score'
    if (bases.second) o[bases.second] = 'third'
    if (bases.first)  o[bases.first]  = 'second'
  } else if (result === '2B') {
    if (bases.third)  o[bases.third]  = 'score'
    if (bases.second) o[bases.second] = 'score'
    if (bases.first)  o[bases.first]  = 'third'
  } else if (result === '3B') {
    if (bases.first)  o[bases.first]  = 'score'
    if (bases.second) o[bases.second] = 'score'
    if (bases.third)  o[bases.third]  = 'score'
  } else if (result === 'SAC') {
    if (bases.third)  o[bases.third]  = 'score'
    if (bases.second) o[bases.second] = 'third'
    if (bases.first)  o[bases.first]  = 'second'
  } else if (result === 'SF') {
    if (bases.third)  o[bases.third]  = 'score'
    if (bases.second) o[bases.second] = 'hold'
    if (bases.first)  o[bases.first]  = 'hold'
  }
  return o
}

export function getAvailableOptions(
  startingBase: BaseKey,
  runnerId: string,
  currentBases: Bases,
  outcomes: Record<string, RunnerDest>,
  batterDest: BaseKey | undefined,
  result: string,
): RunnerDest[] {
  // On a triple all runners can only score or be put out at home
  if (result === '3B') return ['score', 'out']
  // Collect bases already committed by other runners or the batter
  const committed = new Set<BaseKey>()
  if (batterDest) committed.add(batterDest)
  for (const [pid, dest] of Object.entries(outcomes)) {
    if (pid === runnerId) continue
    if (dest === 'score' || dest === 'out') continue
    if (dest === 'hold') {
      const base = (['first', 'second', 'third'] as BaseKey[]).find(b => currentBases[b] === pid)
      if (base) committed.add(base)
    } else {
      committed.add(dest as BaseKey)
    }
  }
  const baseOrder: Record<BaseKey, number> = { first: 1, second: 2, third: 3 }
  const batterOrder = batterDest ? baseOrder[batterDest] : 0
  const filtered = RUNNER_OPTIONS[startingBase].filter(opt => {
    if (opt === 'score') return true
    if (opt === 'hold') return !committed.has(startingBase) && baseOrder[startingBase] > batterOrder
    return !committed.has(opt as BaseKey)
  })
  return [...filtered, 'out']
}

export function computeProjectedBases(
  current: Bases,
  outcomes: Record<string, RunnerDest>,
  result: string,
  batterId: string | undefined,
): Bases {
  if (result === 'HR') return {}
  if (result === 'BB' || result === 'HBP') return advanceBasesForWalk(current, batterId)
  if (!RUNNER_OUTCOME_RESULTS.has(result)) return { ...current }
  const next: Bases = {}
  for (const k of ['first', 'second', 'third'] as BaseKey[]) {
    const pid = current[k]; if (!pid) continue
    const dest = outcomes[pid] ?? 'hold'
    if (dest === 'score' || dest === 'out') continue
    next[dest === 'hold' ? k : dest as BaseKey] = pid
  }
  const batterBase: Record<string, BaseKey> = { '1B':'first','2B':'second','3B':'third','ROE':'first','FC':'first' }
  if (batterBase[result]) next[batterBase[result]] = batterId
  return next
}
