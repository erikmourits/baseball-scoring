import { describe, it, expect } from 'vitest'
import type { LocalAtBat } from '../db/local'
import {
  computeBattingLine,
  computePitchingLine,
  fmtAvg,
  fmtOps,
  fmtEra,
  fmtIp,
  getPitcherDecisions,
} from '../utils/statsCalc'

// ── Helpers ────────────────────────────────────────────────────────────────────

let seq = 0
function ab(result: string | undefined, rbiCount = 0, extra: Partial<LocalAtBat> = {}): LocalAtBat {
  return {
    id: `ab-${++seq}`,
    inningId: 'inning-1',
    batterId: 'batter-1',
    pitcherId: 'pitcher-1',
    result,
    rbiCount,
    sequenceNumber: seq,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    _dirty: false,
    ...extra,
  }
}

// ── computeBattingLine ─────────────────────────────────────────────────────────

describe('computeBattingLine', () => {
  it('empty array returns all zeros', () => {
    const line = computeBattingLine([])
    expect(line.pa).toBe(0)
    expect(line.ab).toBe(0)
    expect(line.h).toBe(0)
    expect(line.avg).toBe(0)
    expect(line.obp).toBe(0)
    expect(line.slg).toBe(0)
    expect(line.ops).toBe(0)
  })

  it('counts plate appearances correctly', () => {
    const line = computeBattingLine([ab('1B'), ab('BB'), ab('K')])
    expect(line.pa).toBe(3)
  })

  it('BB does not count as official at-bat', () => {
    const line = computeBattingLine([ab('BB')])
    expect(line.pa).toBe(1)
    expect(line.ab).toBe(0)
    expect(line.bb).toBe(1)
  })

  it('HBP does not count as official at-bat', () => {
    const line = computeBattingLine([ab('HBP')])
    expect(line.ab).toBe(0)
    expect(line.hbp).toBe(1)
  })

  it('SAC does not count as official at-bat', () => {
    const line = computeBattingLine([ab('SAC')])
    expect(line.ab).toBe(0)
    expect(line.h).toBe(0)
  })

  it('SF does not count as official at-bat', () => {
    const line = computeBattingLine([ab('SF')])
    expect(line.ab).toBe(0)
  })

  it('single increments h and singles', () => {
    const line = computeBattingLine([ab('1B')])
    expect(line.h).toBe(1)
    expect(line.singles).toBe(1)
    expect(line.doubles).toBe(0)
  })

  it('double increments h and doubles', () => {
    const line = computeBattingLine([ab('2B')])
    expect(line.h).toBe(1)
    expect(line.doubles).toBe(1)
    expect(line.singles).toBe(0)
  })

  it('triple increments h and triples', () => {
    const line = computeBattingLine([ab('3B')])
    expect(line.h).toBe(1)
    expect(line.triples).toBe(1)
  })

  it('HR increments h and hr', () => {
    const line = computeBattingLine([ab('HR')])
    expect(line.h).toBe(1)
    expect(line.hr).toBe(1)
  })

  it('K and KL both increment k', () => {
    const line = computeBattingLine([ab('K'), ab('KL')])
    expect(line.k).toBe(2)
  })

  it('sums RBI from all at-bats', () => {
    const line = computeBattingLine([ab('HR', 4), ab('1B', 1)])
    expect(line.rbi).toBe(5)
  })

  it('AVG = H / AB (2 hits in 4 AB = .500)', () => {
    const line = computeBattingLine([ab('1B'), ab('1B'), ab('K'), ab('FO')])
    expect(line.avg).toBeCloseTo(0.5)
  })

  it('AVG is 0 when AB = 0 (all BB)', () => {
    const line = computeBattingLine([ab('BB'), ab('BB')])
    expect(line.avg).toBe(0)
  })

  it('OBP includes BB and HBP in numerator and denominator', () => {
    const line = computeBattingLine([ab('1B'), ab('BB')])
    expect(line.obp).toBeCloseTo(1.0)
  })

  it('OBP denominator includes SF', () => {
    const line = computeBattingLine([ab('SF')])
    expect(line.obp).toBe(0)
  })

  it('SLG = total bases / AB (HR = 4.000)', () => {
    const line = computeBattingLine([ab('HR')])
    expect(line.slg).toBeCloseTo(4.0)
  })

  it('SLG counts bases: 1B=1, 2B=2, 3B=3, HR=4 (TB=10, AB=4 -> 2.500)', () => {
    const line = computeBattingLine([ab('1B'), ab('2B'), ab('3B'), ab('HR')])
    expect(line.slg).toBeCloseTo(2.5)
  })

  it('OPS = OBP + SLG', () => {
    const line = computeBattingLine([ab('1B'), ab('BB'), ab('K')])
    expect(line.ops).toBeCloseTo(line.obp + line.slg)
  })

  it('FO and GO do not count as hits', () => {
    const line = computeBattingLine([ab('FO'), ab('GO')])
    expect(line.h).toBe(0)
  })
})

// ── computeBattingLine — reaches that are not hits ─────────────────────────────

describe('computeBattingLine — ROE and FC', () => {
  it('ROE counts as AB but not as a hit', () => {
    const line = computeBattingLine([ab('ROE')])
    expect(line.pa).toBe(1)
    expect(line.ab).toBe(1)
    expect(line.h).toBe(0)
    expect(line.avg).toBe(0)
  })

  it('ROE does not contribute to OBP', () => {
    // OBP only counts H, BB, HBP in numerator — ROE is excluded
    const line = computeBattingLine([ab('ROE')])
    expect(line.obp).toBe(0)
  })

  it('FC counts as AB but not as a hit', () => {
    const line = computeBattingLine([ab('FC')])
    expect(line.pa).toBe(1)
    expect(line.ab).toBe(1)
    expect(line.h).toBe(0)
  })

  it('undefined result counts as PA and AB with no hit', () => {
    const line = computeBattingLine([ab(undefined)])
    expect(line.pa).toBe(1)
    expect(line.ab).toBe(1)
    expect(line.h).toBe(0)
  })
})

// ── computeBattingLine — realistic game lines ──────────────────────────────────

describe('computeBattingLine — realistic game lines', () => {
  it('4-for-4 with 2 singles, 1 double, 1 HR, 4 RBI', () => {
    const line = computeBattingLine([
      ab('1B', 0), ab('1B', 1), ab('2B', 2), ab('HR', 1),
    ])
    expect(line.pa).toBe(4)
    expect(line.ab).toBe(4)
    expect(line.h).toBe(4)
    expect(line.singles).toBe(2)
    expect(line.doubles).toBe(1)
    expect(line.hr).toBe(1)
    expect(line.rbi).toBe(4)
    expect(line.avg).toBeCloseTo(1.0)
    // TB = 1+1+2+4 = 8, SLG = 8/4 = 2.000
    expect(line.slg).toBeCloseTo(2.0)
  })

  it('0-for-3 with a walk and SAC: ab=3, avg=0, obp from BB only', () => {
    // PA=5, AB=3 (BB and SAC excluded), H=0, BB=1, K=1
    const line = computeBattingLine([ab('K'), ab('GO'), ab('BB'), ab('FO'), ab('SAC')])
    expect(line.pa).toBe(5)
    expect(line.ab).toBe(3)
    expect(line.h).toBe(0)
    expect(line.bb).toBe(1)
    expect(line.k).toBe(1)
    expect(line.avg).toBe(0)
    // OBP = (0+1+0)/(3+1+0+0) = 1/4 = .250
    expect(line.obp).toBeCloseTo(0.25)
  })

  it('all non-AB plate appearances: SAC + SF + BB + HBP -> ab=0, avg=0', () => {
    const line = computeBattingLine([ab('SAC'), ab('SF'), ab('BB'), ab('HBP')])
    expect(line.ab).toBe(0)
    expect(line.avg).toBe(0)
    expect(line.slg).toBe(0)
    // OBP: (0+1+1)/(0+1+1+1) = 2/3
    expect(line.obp).toBeCloseTo(2 / 3)
  })

  it('.300 average (3-for-10) has no floating-point drift', () => {
    const hits = Array.from({ length: 3 }, () => ab('1B'))
    const outs = Array.from({ length: 7 }, () => ab('K'))
    const line = computeBattingLine([...hits, ...outs])
    expect(line.avg).toBeCloseTo(0.3, 10)
  })
})

// ── fmtAvg ─────────────────────────────────────────────────────────────────────

describe('fmtAvg', () => {
  it('0 returns .000', () => expect(fmtAvg(0)).toBe('.000'))
  it('Infinity returns .000', () => expect(fmtAvg(Infinity)).toBe('.000'))
  it('NaN returns .000', () => expect(fmtAvg(NaN)).toBe('.000'))
  it('1/3 formats without leading zero', () => expect(fmtAvg(1 / 3)).toBe('.333'))
  it('0.250 formats correctly', () => expect(fmtAvg(0.25)).toBe('.250'))
  it('1.000 keeps the leading 1', () => expect(fmtAvg(1.0)).toBe('1.000'))
  it('0.500 formats correctly', () => expect(fmtAvg(0.5)).toBe('.500'))
  it('0.300 formats correctly', () => expect(fmtAvg(0.3)).toBe('.300'))
})

// ── fmtOps ─────────────────────────────────────────────────────────────────────

describe('fmtOps', () => {
  it('0 returns .000', () => expect(fmtOps(0)).toBe('.000'))
  it('Infinity returns .000', () => expect(fmtOps(Infinity)).toBe('.000'))
  it('0.750 strips leading zero', () => expect(fmtOps(0.75)).toBe('.750'))
  it('1.000 keeps the leading 1 (no replace)', () => expect(fmtOps(1.0)).toBe('1.000'))
  it('1.234 formats as 1.234', () => expect(fmtOps(1.234)).toBe('1.234'))
  it('0.900 formats correctly', () => expect(fmtOps(0.9)).toBe('.900'))
})

// ── computePitchingLine ────────────────────────────────────────────────────────

describe('computePitchingLine', () => {
  it('empty array returns all zeros', () => {
    const line = computePitchingLine([])
    expect(line.outs).toBe(0)
    expect(line.h).toBe(0)
    expect(line.r).toBe(0)
    expect(line.bb).toBe(0)
    expect(line.k).toBe(0)
    expect(line.era).toBe(0)
  })

  it('K records one out and one strikeout', () => {
    const line = computePitchingLine([ab('K')])
    expect(line.outs).toBe(1)
    expect(line.k).toBe(1)
  })

  it('KL records one out and one strikeout', () => {
    const line = computePitchingLine([ab('KL')])
    expect(line.outs).toBe(1)
    expect(line.k).toBe(1)
  })

  it('FO, GO, SAC, SF each record one out', () => {
    const line = computePitchingLine([ab('FO'), ab('GO'), ab('SAC'), ab('SF')])
    expect(line.outs).toBe(4)
  })

  it('GDP records two outs and does not count as a strikeout', () => {
    const line = computePitchingLine([ab('GDP')])
    expect(line.outs).toBe(2)
    expect(line.k).toBe(0)
  })

  it('hits allowed: 1B, 2B, 3B, HR all count', () => {
    const line = computePitchingLine([ab('1B'), ab('2B'), ab('3B'), ab('HR')])
    expect(line.h).toBe(4)
  })

  it('BB increments walks, does not record an out', () => {
    const line = computePitchingLine([ab('BB')])
    expect(line.bb).toBe(1)
    expect(line.outs).toBe(0)
  })

  it('HBP increments hbp', () => {
    const line = computePitchingLine([ab('HBP')])
    expect(line.hbp).toBe(1)
  })

  it('RBI count accumulates as runs allowed', () => {
    const line = computePitchingLine([ab('HR', 3), ab('1B', 1)])
    expect(line.r).toBe(4)
  })

  it('ERA = (r * 27) / outs (1 IP, 1 run = 9.00)', () => {
    const line = computePitchingLine([ab('K'), ab('FO'), ab('GO', 1)])
    expect(line.outs).toBe(3)
    expect(line.r).toBe(1)
    expect(line.era).toBeCloseTo(9.0)
  })

  it('ERA is 0 when no outs recorded', () => {
    const line = computePitchingLine([ab('BB'), ab('1B', 1)])
    expect(line.outs).toBe(0)
    expect(line.era).toBe(0)
  })

  it('ip = outs / 3', () => {
    const line = computePitchingLine([ab('K'), ab('FO'), ab('GO')])
    expect(line.ip).toBeCloseTo(1.0)
  })
})

// ── computePitchingLine — edge cases ──────────────────────────────────────────

describe('computePitchingLine — non-hits and GDP', () => {
  it('BB and HBP are not counted as hits allowed', () => {
    const line = computePitchingLine([ab('BB'), ab('HBP')])
    expect(line.h).toBe(0)
    expect(line.bb).toBe(1)
    expect(line.hbp).toBe(1)
  })

  it('ROE is not counted as a hit allowed and does not record an out', () => {
    const line = computePitchingLine([ab('ROE')])
    expect(line.h).toBe(0)
    expect(line.outs).toBe(0)
  })

  it('K + FO + GDP totals 4 outs', () => {
    const line = computePitchingLine([ab('K'), ab('FO'), ab('GDP')])
    expect(line.outs).toBe(4)
  })

  it('0 ERA with 0 runs across a full game (27 outs)', () => {
    const outs = Array.from({ length: 27 }, () => ab('K'))
    const line = computePitchingLine(outs)
    expect(line.outs).toBe(27)
    expect(line.r).toBe(0)
    expect(line.era).toBe(0)
    expect(line.k).toBe(27)
  })

  it('ERA of 27.00 for a pitcher who gives up 1 run and records only 1 out', () => {
    const line = computePitchingLine([ab('K', 1)])
    // r=1, outs=1 -> ERA = (1*27)/1 = 27.00
    expect(line.era).toBeCloseTo(27.0)
  })
})

// ── fmtEra ─────────────────────────────────────────────────────────────────────

describe('fmtEra', () => {
  it('outs=0 returns em dash', () => expect(fmtEra(0, 0)).toBe('\u2014'))
  it('outs>0 formats ERA to 2 decimal places', () => expect(fmtEra(27, 3.5)).toBe('3.50'))
  it('perfect ERA formats as 0.00', () => expect(fmtEra(27, 0)).toBe('0.00'))
  it('high ERA is rounded to 2 decimals', () => expect(fmtEra(3, 9.0)).toBe('9.00'))
})

// ── fmtIp ──────────────────────────────────────────────────────────────────────

describe('fmtIp', () => {
  it('0 outs returns 0.0', () => expect(fmtIp(0)).toBe('0.0'))
  it('1 out returns 0.1', () => expect(fmtIp(1)).toBe('0.1'))
  it('2 outs returns 0.2', () => expect(fmtIp(2)).toBe('0.2'))
  it('3 outs returns 1.0', () => expect(fmtIp(3)).toBe('1.0'))
  it('10 outs returns 3.1', () => expect(fmtIp(10)).toBe('3.1'))
  it('11 outs returns 3.2', () => expect(fmtIp(11)).toBe('3.2'))
  it('13 outs returns 4.1', () => expect(fmtIp(13)).toBe('4.1'))
  it('14 outs returns 4.2', () => expect(fmtIp(14)).toBe('4.2'))
  it('15 outs returns 5.0', () => expect(fmtIp(15)).toBe('5.0'))
  it('27 outs returns 9.0 (complete game)', () => expect(fmtIp(27)).toBe('9.0'))
  it('81 outs returns 27.0 (three complete games)', () => expect(fmtIp(81)).toBe('27.0'))
})

// ── getPitcherDecisions ────────────────────────────────────────────────────────

describe('getPitcherDecisions', () => {
  it('tie game returns empty object', () => {
    expect(getPitcherDecisions([], {}, 3, 3)).toEqual({})
  })

  it('no pitchers tracked returns undefined decisions', () => {
    const result = getPitcherDecisions(
      [ab('K', 0, { inningId: 'i1', pitcherId: undefined })],
      { 'i1': 'top' },
      5, 3,
    )
    expect(result.winnerId).toBeUndefined()
  })

  it('home team wins: pitcher with most outs in top half gets W', () => {
    const atBats = [
      ab('K',  0, { inningId: 'i1', pitcherId: 'P1' }),
      ab('FO', 0, { inningId: 'i1', pitcherId: 'P1' }),
      ab('GO', 0, { inningId: 'i1', pitcherId: 'P1' }),
      ab('K',  0, { inningId: 'i2', pitcherId: 'P2' }),
    ]
    const halfMap = { 'i1': 'top' as const, 'i2': 'bottom' as const }
    const result = getPitcherDecisions(atBats, halfMap, 5, 3)
    expect(result.winnerId).toBe('P1')
    expect(result.loserId).toBe('P2')
  })

  it('away team wins: pitcher with most outs in bottom half gets W', () => {
    const atBats = [
      ab('K',  0, { inningId: 'i1', pitcherId: 'P_away' }),
      ab('K',  0, { inningId: 'i2', pitcherId: 'P_home' }),
      ab('FO', 0, { inningId: 'i2', pitcherId: 'P_home' }),
    ]
    const halfMap = { 'i1': 'top' as const, 'i2': 'bottom' as const }
    const result = getPitcherDecisions(atBats, halfMap, 1, 4)
    expect(result.winnerId).toBe('P_home')
    expect(result.loserId).toBe('P_away')
  })

  it('pitcher with most outs among multiple candidates gets the W', () => {
    const atBats = [
      ab('K',  0, { inningId: 'i1', pitcherId: 'P1' }),
      ab('K',  0, { inningId: 'i2', pitcherId: 'P2' }),
      ab('FO', 0, { inningId: 'i2', pitcherId: 'P2' }),
      ab('GO', 0, { inningId: 'i2', pitcherId: 'P2' }),
      ab('K',  0, { inningId: 'i3', pitcherId: 'P_loss' }),
    ]
    const halfMap = { 'i1': 'top' as const, 'i2': 'top' as const, 'i3': 'bottom' as const }
    const result = getPitcherDecisions(atBats, halfMap, 5, 2)
    expect(result.winnerId).toBe('P2')
    expect(result.loserId).toBe('P_loss')
  })

  it('unknown inningId in halfMap: at-bats are skipped', () => {
    const atBats = [ab('K', 0, { inningId: 'unknown', pitcherId: 'P1' })]
    const result = getPitcherDecisions(atBats, {}, 3, 1)
    expect(result.winnerId).toBeUndefined()
  })
})

// ── getPitcherDecisions — GDP outs ─────────────────────────────────────────────

describe('getPitcherDecisions — GDP counts as 2 outs', () => {
  it('pitcher with 1 GDP (2 outs) beats pitcher with 1 K (1 out)', () => {
    const atBats = [
      ab('K',   0, { inningId: 'i1', pitcherId: 'P_few' }),  // 1 out
      ab('GDP', 0, { inningId: 'i1', pitcherId: 'P_gdp' }),  // 2 outs
      ab('K',   0, { inningId: 'i2', pitcherId: 'P_loss' }),
    ]
    const halfMap = { 'i1': 'top' as const, 'i2': 'bottom' as const }
    const result = getPitcherDecisions(atBats, halfMap, 5, 2)
    expect(result.winnerId).toBe('P_gdp')
  })
})

// ── computePitchingLine — WHIP ─────────────────────────────────────────────────

describe('computePitchingLine — WHIP', () => {
  it('0 outs returns whip = 0', () => {
    const line = computePitchingLine([])
    expect(line.whip).toBe(0)
  })

  it('1 hit in 1 inning (3 outs) = WHIP 1.000', () => {
    const line = computePitchingLine([ab('1B'), ab('K'), ab('K'), ab('K')])
    // 1 hit, 0 BB, 3 outs (1 IP) -> WHIP = 1 / 1 = 1.000
    expect(line.whip).toBeCloseTo(1.0)
  })

  it('1 walk and 1 hit in 1 inning = WHIP 2.000', () => {
    const line = computePitchingLine([ab('BB'), ab('1B'), ab('K'), ab('K'), ab('K')])
    // 1 BB + 1 H = 2, 3 outs (1 IP) -> WHIP = 2 / 1 = 2.000
    expect(line.whip).toBeCloseTo(2.0)
  })

  it('perfect inning (3 outs, 0 baserunners) = WHIP 0.000', () => {
    const line = computePitchingLine([ab('K'), ab('FO'), ab('GO')])
    expect(line.whip).toBeCloseTo(0.0)
  })

  it('6 innings (18 outs), 6 H, 3 BB = WHIP 1.500', () => {
    const outs = Array.from({ length: 12 }, () => ab('K'))
    const hits = Array.from({ length: 6 }, () => ab('1B'))
    const walks = Array.from({ length: 3 }, () => ab('BB'))
    const gdps = Array.from({ length: 3 }, () => ab('GDP')) // 3 GDP = 6 outs
    const line = computePitchingLine([...outs, ...hits, ...walks, ...gdps])
    // 18 outs = 6 IP, 9 baserunners -> WHIP = 9 / 6 = 1.500
    expect(line.whip).toBeCloseTo(1.5)
  })
})

// ── computePitchingLine — RBI proxy limitation ─────────────────────────────────

describe('computePitchingLine — RBI proxy for runs', () => {
  it('rbiCount sums to r: HR with 2 runners on = 3 RBI = 3 r', () => {
    const line = computePitchingLine([ab('HR', 3), ab('K'), ab('K'), ab('K')])
    expect(line.r).toBe(3)
  })

  it('r = 0 when no at-bat rbiCounts (baserunning-event runs not counted)', () => {
    // If a runner scores on a WP/PB/BALK (no rbiCount on at-bat), r stays 0.
    // This documents the known limitation: those runs require LocalBaserunningEvent.
    const line = computePitchingLine([ab('1B', 0), ab('K'), ab('K')])
    expect(line.r).toBe(0)
  })
})
