import type { LocalAtBat, LocalBaserunningEvent } from '../db/local'

// ── MISSING STATS (data exists in DB, not yet surfaced) ────────────────────────
//
//  Batting:
//    r   (runs scored)  — source: scoredPlayerIds on LocalAtBat
//    sb  (stolen bases) — source: LocalBaserunningEvent.eventType === 'SB'
//    cs  (caught steal) — source: LocalBaserunningEvent.eventType === 'CS'
//
//  Pitching:
//    er  (earned runs)  — not tracked; requires earned/unearned flag per at-bat
//    sv / hld / bs      — not tracked; requires save-situation detection
//
//  Fielding:
//    e / po / a         — stored in LocalFieldingCredit, never surfaced in stat lines
//
//  Derivable now (no schema change needed):
//    whip               — (bb + h) / ip — added below
//
// ── RESOLVED ──────────────────────────────────────────────────────────────────
//
//  computePitchingLine now accepts LocalBaserunningEvent[] as a second parameter
//  and correctly counts toBase === 'score' events as runs allowed. Baserunning
//  scoring events (WP, PB, BALK) are attributed to pitchers via
//  attributeScoringEventsToPitchers and passed in via baserunningEvents param.

// ── Stat types ─────────────────────────────────────────────────────────────────

export interface BattingLine {
  pa:      number   // plate appearances
  ab:      number   // official at-bats (PA - BB - HBP - SAC - SF)
  h:       number   // hits (1B + 2B + 3B + HR)
  singles: number
  doubles: number
  triples: number
  hr:      number
  rbi:     number
  bb:      number
  k:       number   // K + KL combined
  hbp:     number
  avg:     number   // H / AB
  obp:     number   // (H + BB + HBP) / (AB + BB + HBP + SF)
  slg:     number   // total bases / AB
  ops:     number   // OBP + SLG
}

// ── Core calculation ───────────────────────────────────────────────────────────

export function computeBattingLine(atBats: LocalAtBat[]): BattingLine {
  let doubles = 0, triples = 0, hr = 0, h = 0
  let bb = 0, hbp = 0, sac = 0, sf = 0, k = 0, rbi = 0

  for (const ab of atBats) {
    const r = ab.result ?? ''
    rbi += ab.rbiCount ?? 0
    if (r === 'BB')        { bb++;  continue }
    if (r === 'HBP')       { hbp++; continue }
    if (r === 'SAC')       { sac++; continue }
    if (r === 'SF')        { sf++;  continue }
    if (r === '1B')        h++
    if (r === '2B')        { h++; doubles++ }
    if (r === '3B')        { h++; triples++ }
    if (r === 'HR')        { h++; hr++ }
    if (r === 'K' || r === 'KL') k++
  }

  const pa = atBats.length
  const ab = pa - bb - hbp - sac - sf
  const singles = h - doubles - triples - hr
  const totalBases = singles + 2 * doubles + 3 * triples + 4 * hr
  const avg = ab > 0 ? h / ab : 0
  const obp = (ab + bb + hbp + sf) > 0 ? (h + bb + hbp) / (ab + bb + hbp + sf) : 0
  const slg = ab > 0 ? totalBases / ab : 0

  return { pa, ab, h, singles, doubles, triples, hr, rbi, bb, k, hbp, avg, obp, slg, ops: obp + slg }
}

// ── Format helpers ─────────────────────────────────────────────────────────────

/** Format batting rate as .333 style (no leading zero) */
export function fmtAvg(n: number): string {
  if (n === 0 || !isFinite(n)) return '.000'
  return n.toFixed(3).replace(/^0/, '')
}

/** Format OPS — can be > 1.000 */
export function fmtOps(n: number): string {
  if (!isFinite(n) || n === 0) return '.000'
  return n >= 1 ? n.toFixed(3) : n.toFixed(3).replace(/^0/, '')
}

// ── Pitching ───────────────────────────────────────────────────────────────────

export interface PitchingLine {
  outs: number   // total outs recorded
  ip:   number   // decimal innings (outs / 3, e.g. 13 outs = 4.333)
  h:    number   // hits allowed
  r:    number   // runs allowed (rbiCount + baserunning-event scoring runs)
  bb:   number   // walks issued
  k:    number   // strikeouts
  hbp:  number   // hit batters
  era:  number   // earned run average: (r * 27) / outs
  whip: number   // (bb + h) / (outs / 3); 0 when outs = 0
}

const OUT_RESULTS = new Set(['K', 'KL', 'FO', 'GO', 'SAC', 'SF'])

export function computePitchingLine(
  atBats: LocalAtBat[],
  baserunningEvents: LocalBaserunningEvent[] = [],
): PitchingLine {
  let outs = 0, h = 0, r = 0, bb = 0, k = 0, hbp = 0

  for (const ab of atBats) {
    const res = ab.result ?? ''
    if (res === 'GDP')                   outs += 2
    else if (OUT_RESULTS.has(res))       outs += 1
    if (res === '1B' || res === '2B' || res === '3B' || res === 'HR') h++
    if (res === 'BB')  bb++
    if (res === 'HBP') hbp++
    if (res === 'K' || res === 'KL') k++
    r += ab.rbiCount ?? 0  // RBI proxy for direct-scoring at-bats
  }

  for (const ev of baserunningEvents) {
    if (ev.toBase === 'score') r++
  }
  const era  = outs > 0 ? (r * 27) / outs : 0
  const whip = outs > 0 ? (bb + h) / (outs / 3) : 0
  return { outs, ip: outs / 3, h, r, bb, k, hbp, era, whip }
}


/** Format ERA: show "—" when no innings pitched */
export function fmtEra(outs: number, era: number): string {
  if (outs === 0) return '—'
  return era.toFixed(2)
}

const OUT_RESULTS_DECISION = new Set(['K', 'KL', 'FO', 'GO', 'SAC', 'SF'])

/**
 * For a completed game, return which pitcher gets the Win and which gets the Loss.
 * The pitcher with the most outs for the winning team gets the W, and vice versa.
 * Returns empty object for a tie game or when no pitchers are tracked.
 */
export function getPitcherDecisions(
  atBats: LocalAtBat[],
  inningHalfMap: Record<string, 'top' | 'bottom'>,
  homeScore: number,
  awayScore: number,
): { winnerId?: string; loserId?: string } {
  if (homeScore === awayScore) return {}
  const homeWon = homeScore > awayScore
  const winHalf  = homeWon ? 'top'    : 'bottom'
  const loseHalf = homeWon ? 'bottom' : 'top'
  const winOuts:  Record<string, number> = {}
  const loseOuts: Record<string, number> = {}
  for (const ab of atBats) {
    if (!ab.pitcherId) continue
    const half = inningHalfMap[ab.inningId]
    if (!half) continue
    const o = ab.result === 'GDP' ? 2 : OUT_RESULTS_DECISION.has(ab.result ?? '') ? 1 : 0
    if (half === winHalf)  winOuts[ab.pitcherId]  = (winOuts[ab.pitcherId]  ?? 0) + o
    if (half === loseHalf) loseOuts[ab.pitcherId] = (loseOuts[ab.pitcherId] ?? 0) + o
  }
  const topId = (map: Record<string, number>) =>
    Object.entries(map).sort((a, b) => b[1] - a[1])[0]?.[0]
  return { winnerId: topId(winOuts), loserId: topId(loseOuts) }
}

/** Format innings pitched: 13 outs -> "4.1", 14 -> "4.2", 15 -> "5.0" */
export function fmtIp(outs: number): string {
  if (outs === 0) return '0.0'
  const full = Math.floor(outs / 3)
  const rem  = outs % 3
  return `${full}.${rem}`
}
