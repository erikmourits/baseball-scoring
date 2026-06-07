import { describe, it, expect } from 'vitest'
import {
  outsFromResult,
  advanceBasesForWalk,
  defaultOutcomes,
  getAvailableOptions,
  computeProjectedBases,
  OUTS_RESULTS,
  RUNNER_OUTCOME_RESULTS,
  BATTER_DEST,
} from '../utils/baseballLogic'
import type { Bases, RunnerDest } from '../types/game'

// ── outsFromResult ─────────────────────────────────────────────────────────────

describe('outsFromResult', () => {
  it('returns 1 for standard out results', () => {
    expect(outsFromResult('K')).toBe(1)
    expect(outsFromResult('KL')).toBe(1)
    expect(outsFromResult('FO')).toBe(1)
    expect(outsFromResult('GO')).toBe(1)
    expect(outsFromResult('SAC')).toBe(1)
    expect(outsFromResult('SF')).toBe(1)
  })

  it('returns 2 for GDP (double play)', () => {
    expect(outsFromResult('GDP')).toBe(2)
  })

  it('returns 0 for hits and reaches', () => {
    expect(outsFromResult('1B')).toBe(0)
    expect(outsFromResult('2B')).toBe(0)
    expect(outsFromResult('3B')).toBe(0)
    expect(outsFromResult('HR')).toBe(0)
    expect(outsFromResult('BB')).toBe(0)
    expect(outsFromResult('HBP')).toBe(0)
    expect(outsFromResult('ROE')).toBe(0)
    expect(outsFromResult('FC')).toBe(0)
  })
})

// ── advanceBasesForWalk ────────────────────────────────────────────────────────

describe('advanceBasesForWalk', () => {
  it('puts batter on first when bases empty', () => {
    const result = advanceBasesForWalk({}, 'batter')
    expect(result).toEqual({ first: 'batter' })
  })

  it('forces runner on first to second', () => {
    const result = advanceBasesForWalk({ first: 'r1' }, 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r1' })
  })

  it('forces runners on first and second, chain advances', () => {
    const result = advanceBasesForWalk({ first: 'r1', second: 'r2' }, 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r1', third: 'r2' })
  })

  it('bases loaded: runner on third scores (disappears), others advance', () => {
    const result = advanceBasesForWalk({ first: 'r1', second: 'r2', third: 'r3' }, 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r1', third: 'r2' })
    expect(result.third).toBe('r2')  // r3 scored off
  })

  it('runner on second only: batter goes to first, runner on second stays', () => {
    // Runner on 2nd is not forced — only moves if 1st is occupied
    const result = advanceBasesForWalk({ second: 'r2' }, 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r2' })
  })

  it('runner on third only: batter goes to first, runner on third stays', () => {
    const result = advanceBasesForWalk({ third: 'r3' }, 'batter')
    expect(result).toEqual({ first: 'batter', third: 'r3' })
  })

  it('runners on first and third: first is forced to second, third stays', () => {
    const result = advanceBasesForWalk({ first: 'r1', third: 'r3' }, 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r1', third: 'r3' })
  })
})

// ── defaultOutcomes ────────────────────────────────────────────────────────────

describe('defaultOutcomes', () => {
  it('1B: runner on first goes to second', () => {
    const o = defaultOutcomes('1B', { first: 'r1' })
    expect(o['r1']).toBe('second')
  })

  it('1B: runner on second goes to third', () => {
    const o = defaultOutcomes('1B', { second: 'r2' })
    expect(o['r2']).toBe('third')
  })

  it('1B: runner on third scores', () => {
    const o = defaultOutcomes('1B', { third: 'r3' })
    expect(o['r3']).toBe('score')
  })

  it('1B: bases loaded — chain advance', () => {
    const o = defaultOutcomes('1B', { first: 'r1', second: 'r2', third: 'r3' })
    expect(o['r1']).toBe('second')
    expect(o['r2']).toBe('third')
    expect(o['r3']).toBe('score')
  })

  it('2B: runner on first goes to third', () => {
    const o = defaultOutcomes('2B', { first: 'r1' })
    expect(o['r1']).toBe('third')
  })

  it('2B: runner on second scores', () => {
    const o = defaultOutcomes('2B', { second: 'r2' })
    expect(o['r2']).toBe('score')
  })

  it('2B: runner on third scores', () => {
    const o = defaultOutcomes('2B', { third: 'r3' })
    expect(o['r3']).toBe('score')
  })

  it('3B: all runners score', () => {
    const o = defaultOutcomes('3B', { first: 'r1', second: 'r2', third: 'r3' })
    expect(o['r1']).toBe('score')
    expect(o['r2']).toBe('score')
    expect(o['r3']).toBe('score')
  })

  it('ROE: same as single', () => {
    const o = defaultOutcomes('ROE', { first: 'r1', second: 'r2' })
    expect(o['r1']).toBe('second')
    expect(o['r2']).toBe('third')
  })

  it('FC: same as single', () => {
    const o = defaultOutcomes('FC', { first: 'r1' })
    expect(o['r1']).toBe('second')
  })

  it('SAC: same chain as single', () => {
    const o = defaultOutcomes('SAC', { first: 'r1', second: 'r2', third: 'r3' })
    expect(o['r1']).toBe('second')
    expect(o['r2']).toBe('third')
    expect(o['r3']).toBe('score')
  })

  it('SF: third scores, others hold', () => {
    const o = defaultOutcomes('SF', { first: 'r1', second: 'r2', third: 'r3' })
    expect(o['r3']).toBe('score')
    expect(o['r2']).toBe('hold')
    expect(o['r1']).toBe('hold')
  })

  it('returns empty object for HR (no runner outcomes needed)', () => {
    const o = defaultOutcomes('HR', { first: 'r1', second: 'r2' })
    expect(Object.keys(o)).toHaveLength(0)
  })

  it('returns empty object for strikeout', () => {
    const o = defaultOutcomes('K', { first: 'r1' })
    expect(Object.keys(o)).toHaveLength(0)
  })
})

// ── getAvailableOptions ────────────────────────────────────────────────────────

describe('getAvailableOptions', () => {
  const emptyOutcomes: Record<string, RunnerDest> = {}

  it('on a triple, only score or out are available', () => {
    const opts = getAvailableOptions('first', 'r1', { first: 'r1' }, emptyOutcomes, 'third', '3B')
    expect(opts).toEqual(['score', 'out'])
  })

  it('always includes out as an option', () => {
    const opts = getAvailableOptions('first', 'r1', { first: 'r1' }, emptyOutcomes, 'first', '1B')
    expect(opts).toContain('out')
  })

  it('1B: runner on first cannot hold (batter occupies first)', () => {
    // Batter hits single (goes to first), runner on first — hold is blocked
    const opts = getAvailableOptions('first', 'r1', { first: 'r1' }, emptyOutcomes, 'first', '1B')
    expect(opts).not.toContain('hold')
  })

  it('1B: runner on second can hold (batter is behind on first)', () => {
    const opts = getAvailableOptions('second', 'r2', { second: 'r2' }, emptyOutcomes, 'first', '1B')
    expect(opts).toContain('hold')
  })

  it('1B: runner on third can hold', () => {
    const opts = getAvailableOptions('third', 'r3', { third: 'r3' }, emptyOutcomes, 'first', '1B')
    expect(opts).toContain('hold')
  })

  it('2B: runner on first cannot hold (batter on second is ahead)', () => {
    const opts = getAvailableOptions('first', 'r1', { first: 'r1' }, emptyOutcomes, 'second', '2B')
    expect(opts).not.toContain('hold')
    // runner on first can go to third or score (not second — batter is there)
    expect(opts).not.toContain('second')
    expect(opts).toContain('third')
    expect(opts).toContain('score')
  })

  it('committed base blocks other runners', () => {
    // Runner r1 on 1st already committed to 3rd, runner r2 on 2nd cannot also go to 3rd
    const outcomes: Record<string, RunnerDest> = { r1: 'third' }
    const opts = getAvailableOptions('second', 'r2', { first: 'r1', second: 'r2' }, outcomes, 'first', '1B')
    expect(opts).not.toContain('third') // r1 already going there
    expect(opts).toContain('score')
    expect(opts).toContain('out')
  })

  it('runner choosing score does not block other runners from scoring', () => {
    const outcomes: Record<string, RunnerDest> = { r3: 'score' }
    const opts = getAvailableOptions('second', 'r2', { second: 'r2', third: 'r3' }, outcomes, 'first', '1B')
    expect(opts).toContain('score') // multiple runners can score
  })

  it('runner on hold position does not block others from passing through', () => {
    // r2 holds on 2nd, r1 on 1st should still be able to go to 3rd
    const outcomes: Record<string, RunnerDest> = { r2: 'hold' }
    const bases: Bases = { first: 'r1', second: 'r2' }
    // With batter going to 1st, r2 is committed to 2nd (hold), so r1 can go to 3rd
    const opts = getAvailableOptions('first', 'r1', bases, outcomes, 'first', '1B')
    // r1 cannot hold (batter takes 1st) and cannot go to 2nd (r2 is there)
    expect(opts).not.toContain('hold')
    expect(opts).not.toContain('second')
    expect(opts).toContain('third')
    expect(opts).toContain('score')
  })

  it('no batter dest (batter is out): hold available if base is not committed', () => {
    // On a GO, batter is out so no batter_dest. Runner on 2nd can hold.
    const opts = getAvailableOptions('second', 'r2', { second: 'r2' }, emptyOutcomes, undefined, 'GO')
    expect(opts).toContain('hold')
  })
})

// ── computeProjectedBases ──────────────────────────────────────────────────────

describe('computeProjectedBases', () => {
  it('HR: projected bases are always empty', () => {
    const result = computeProjectedBases(
      { first: 'r1', second: 'r2', third: 'r3' }, {}, 'HR', 'batter'
    )
    expect(result).toEqual({})
  })

  it('BB: advances via walk logic with no runners', () => {
    const result = computeProjectedBases({}, {}, 'BB', 'batter')
    expect(result).toEqual({ first: 'batter' })
  })

  it('BB: forced advance with runner on first', () => {
    const result = computeProjectedBases({ first: 'r1' }, {}, 'BB', 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r1' })
  })

  it('HBP: same as BB', () => {
    const result = computeProjectedBases({ first: 'r1' }, {}, 'HBP', 'batter')
    expect(result).toEqual({ first: 'batter', second: 'r1' })
  })

  it('K: bases unchanged', () => {
    const bases = { first: 'r1', second: 'r2' }
    const result = computeProjectedBases(bases, {}, 'K', 'batter')
    expect(result).toEqual(bases)
  })

  it('FO: bases unchanged', () => {
    const bases = { second: 'r2' }
    const result = computeProjectedBases(bases, {}, 'FO', 'batter')
    expect(result).toEqual(bases)
  })

  it('1B: runner scores, batter placed on first', () => {
    const bases: Bases = { third: 'r3' }
    const outcomes: Record<string, RunnerDest> = { r3: 'score' }
    const result = computeProjectedBases(bases, outcomes, '1B', 'batter')
    expect(result.first).toBe('batter')
    expect(result.third).toBeUndefined() // r3 scored
  })

  it('1B: runner advances, batter on first', () => {
    const bases: Bases = { second: 'r2' }
    const outcomes: Record<string, RunnerDest> = { r2: 'third' }
    const result = computeProjectedBases(bases, outcomes, '1B', 'batter')
    expect(result).toEqual({ first: 'batter', third: 'r2' })
  })

  it('1B: runner out, disappears from bases', () => {
    const bases: Bases = { first: 'r1' }
    const outcomes: Record<string, RunnerDest> = { r1: 'out' }
    const result = computeProjectedBases(bases, outcomes, '1B', 'batter')
    expect(result.first).toBe('batter')
    expect(Object.values(result)).not.toContain('r1')
  })

  it('2B: runner on first goes to third, batter on second', () => {
    const bases: Bases = { first: 'r1' }
    const outcomes: Record<string, RunnerDest> = { r1: 'third' }
    const result = computeProjectedBases(bases, outcomes, '2B', 'batter')
    expect(result).toEqual({ second: 'batter', third: 'r1' })
  })

  it('3B: runners scored, batter on third', () => {
    const bases: Bases = { first: 'r1', second: 'r2' }
    const outcomes: Record<string, RunnerDest> = { r1: 'score', r2: 'score' }
    const result = computeProjectedBases(bases, outcomes, '3B', 'batter')
    expect(result).toEqual({ third: 'batter' })
  })

  it('SAC: runner advances, batter is out (no batter placed)', () => {
    const bases: Bases = { first: 'r1' }
    const outcomes: Record<string, RunnerDest> = { r1: 'second' }
    const result = computeProjectedBases(bases, outcomes, 'SAC', 'batter')
    // SAC is in RUNNER_OUTCOME_RESULTS; BATTER_DEST['SAC'] is undefined → batter not placed
    expect(result).toEqual({ second: 'r1' })
    expect(Object.values(result)).not.toContain('batter')
  })

  it('SF: runner scores from third, others hold', () => {
    const bases: Bases = { first: 'r1', third: 'r3' }
    const outcomes: Record<string, RunnerDest> = { r3: 'score', r1: 'hold' }
    const result = computeProjectedBases(bases, outcomes, 'SF', 'batter')
    expect(result.first).toBe('r1')
    expect(Object.values(result)).not.toContain('r3')
  })

  it('GO: bases unchanged (batter is out, no runner outcomes)', () => {
    const bases: Bases = { second: 'r2' }
    const result = computeProjectedBases(bases, {}, 'GO', 'batter')
    expect(result).toEqual(bases)
  })
})

// ── Constant sets ──────────────────────────────────────────────────────────────

describe('OUTS_RESULTS set', () => {
  it('contains all expected out results', () => {
    expect(OUTS_RESULTS.has('K')).toBe(true)
    expect(OUTS_RESULTS.has('KL')).toBe(true)
    expect(OUTS_RESULTS.has('FO')).toBe(true)
    expect(OUTS_RESULTS.has('GO')).toBe(true)
    expect(OUTS_RESULTS.has('SAC')).toBe(true)
    expect(OUTS_RESULTS.has('SF')).toBe(true)
    expect(OUTS_RESULTS.has('GDP')).toBe(true)
  })

  it('does not include hits or reaches', () => {
    expect(OUTS_RESULTS.has('1B')).toBe(false)
    expect(OUTS_RESULTS.has('HR')).toBe(false)
    expect(OUTS_RESULTS.has('BB')).toBe(false)
    expect(OUTS_RESULTS.has('ROE')).toBe(false)
  })
})

describe('RUNNER_OUTCOME_RESULTS set', () => {
  it('includes results that need interactive runner placement', () => {
    expect(RUNNER_OUTCOME_RESULTS.has('1B')).toBe(true)
    expect(RUNNER_OUTCOME_RESULTS.has('2B')).toBe(true)
    expect(RUNNER_OUTCOME_RESULTS.has('3B')).toBe(true)
    expect(RUNNER_OUTCOME_RESULTS.has('ROE')).toBe(true)
    expect(RUNNER_OUTCOME_RESULTS.has('FC')).toBe(true)
    expect(RUNNER_OUTCOME_RESULTS.has('SAC')).toBe(true)
    expect(RUNNER_OUTCOME_RESULTS.has('SF')).toBe(true)
  })

  it('does not include HR (auto-score), BB (force advance), or outs', () => {
    expect(RUNNER_OUTCOME_RESULTS.has('HR')).toBe(false)
    expect(RUNNER_OUTCOME_RESULTS.has('BB')).toBe(false)
    expect(RUNNER_OUTCOME_RESULTS.has('K')).toBe(false)
    expect(RUNNER_OUTCOME_RESULTS.has('GO')).toBe(false)
  })
})

describe('BATTER_DEST map', () => {
  it('maps hit/reach results to the correct base', () => {
    expect(BATTER_DEST['1B']).toBe('first')
    expect(BATTER_DEST['2B']).toBe('second')
    expect(BATTER_DEST['3B']).toBe('third')
    expect(BATTER_DEST['ROE']).toBe('first')
    expect(BATTER_DEST['FC']).toBe('first')
  })

  it('returns undefined for out results (batter does not occupy a base)', () => {
    expect(BATTER_DEST['K']).toBeUndefined()
    expect(BATTER_DEST['HR']).toBeUndefined()
    expect(BATTER_DEST['BB']).toBeUndefined()
    expect(BATTER_DEST['SAC']).toBeUndefined()
  })
})

// ── Edge cases & regression tests ──────────────────────────────────────────────

describe('edge cases', () => {
  it('advanceBasesForWalk with undefined batter ID', () => {
    const result = advanceBasesForWalk({}, undefined)
    expect(result.first).toBeUndefined()
  })

  it('defaultOutcomes with empty bases returns empty object', () => {
    const o = defaultOutcomes('1B', {})
    expect(Object.keys(o)).toHaveLength(0)
  })

  it('computeProjectedBases with empty bases and non-runner-outcome result', () => {
    const result = computeProjectedBases({}, {}, 'K', 'batter')
    expect(result).toEqual({})
  })

  it('getAvailableOptions: runner on second, batter hits double — hold is not available (batter on 2nd)', () => {
    // If runner on 2nd and batter hits double (batter goes to 2nd), runner cannot hold on 2nd
    const opts = getAvailableOptions('second', 'r2', { second: 'r2' }, {}, 'second', '2B')
    expect(opts).not.toContain('hold')
    expect(opts).not.toContain('second') // batter occupies this
    expect(opts).toContain('third')
    expect(opts).toContain('score')
  })

  it('getAvailableOptions: on a triple, runner on third can only score or be out', () => {
    const opts = getAvailableOptions('third', 'r3', { third: 'r3' }, {}, 'third', '3B')
    expect(opts).toEqual(['score', 'out'])
  })

  it('multiple runners: each runner destination is independent for scoring', () => {
    // Bases loaded, batter hits 1B — all three runners can potentially score
    const bases: Bases = { first: 'r1', second: 'r2', third: 'r3' }
    // r3 already marked to score, check r2 can also score
    const outcomes: Record<string, RunnerDest> = { r3: 'score' }
    const opts = getAvailableOptions('second', 'r2', bases, outcomes, 'first', '1B')
    expect(opts).toContain('score')
    expect(opts).toContain('third') // r3 scored so 3rd is free
  })

  it('computeProjectedBases: runner holds at their base', () => {
    const bases: Bases = { second: 'r2', third: 'r3' }
    const outcomes: Record<string, RunnerDest> = { r3: 'score', r2: 'hold' }
    const result = computeProjectedBases(bases, outcomes, 'SF', 'batter')
    expect(result.second).toBe('r2')  // held
    expect(result.third).toBeUndefined() // scored
  })
})
