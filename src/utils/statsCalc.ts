import type { LocalAtBat } from '../db/local'

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
