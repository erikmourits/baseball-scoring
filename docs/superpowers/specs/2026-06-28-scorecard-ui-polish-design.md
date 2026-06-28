# Scorecard UI Polish — Design Spec

**Date:** 2026-06-28  
**Scope:** Visual consistency between ScoreCard and GameSummary pages; column alignment between away and home batting tables.

---

## Goals

1. Scorecard and summary pages look visually consistent (same card containers, same header typography, same linescore zero-dot style).
2. Away and home batting grids column-align — inning 1 for away is directly above inning 1 for home.
3. The score header on both pages applies opacity dimming to the losing team.

---

## Files Changed

| File | Change |
|------|--------|
| `src/scorecard/views/Scorecard.tsx` | Merge batting tables; update all styling |
| `src/scorecard/components/Linescore.tsx` | Add card wrapper; zero → dot; R label → "R" |
| `src/pages/ScorecardPage.tsx` | Score header: add opacity dimming for losing team |

---

## Design

### 1. Linescore (`Linescore.tsx`)

Wrap the table in a card: `bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-x-auto mb-5`.

Styling changes inside:
- Zero runs rendered as `<span className="text-gray-300">·</span>` (matches summary).
- R total column uses `border-l border-gray-100 dark:border-gray-700` (lighter than current heavy gray-300 line).
- Row divider: `border-b border-gray-50 dark:border-gray-800` (matches summary).

The existing table structure (inning columns, H, R totals) is preserved.

---

### 2. Section headers (`Scorecard.tsx`)

Change from:
```
text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2
```
To (matches summary):
```
text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2
```

---

### 3. Merged batting table (`Scorecard.tsx`)

**Replace** the two separate `<BattingSection>` calls with a single merged table rendered inline.

**Structure:**

```
<div overflow-x-auto>  ← single scroll container
  <table>
    <thead>
      <tr> # | Player | Pos | 1 | 2 | ... | AB | H | R | RBI | BB | K </tr>
    </thead>
    <tbody>
      <tr> [AWAY TEAM separator — spans all columns, brand-50/gray-800 bg] </tr>
      <tr> away batter 1 ... </tr>
      <tr> away batter 2 ... </tr>
      ...
      <tr> [HOME TEAM separator — spans all columns] </tr>
      <tr> home batter 1 ... </tr>
      ...
    </tbody>
  </table>
</div>
```

**Column alignment fix:**

Compute a single `allSlotsByInning` map before rendering:

```ts
const allSlotsByInning = new Map<number, number>()
for (const n of inningNums) {
  const awayId = halfInningMap('top').get(n)
  const homeId = halfInningMap('bottom').get(n)
  const awayMax = awayLineup.reduce((m, e) =>
    Math.max(m, atBatsByBatterAndInning.get(e.playerId)?.get(awayId ?? '')?.length ?? 0), 0)
  const homeMax = homeLineup.reduce((m, e) =>
    Math.max(m, atBatsByBatterAndInning.get(e.playerId)?.get(homeId ?? '')?.length ?? 0), 0)
  allSlotsByInning.set(n, Math.max(1, awayMax, homeMax))
}
```

Both halves use `allSlotsByInning` → identical column counts → perfect alignment.

**Separator row styling:**

```
bg-brand-50 dark:bg-blue-900/20  (brand accent, very light)
text-xs font-semibold text-brand-500 dark:text-brand-100 uppercase tracking-wide
px-2 py-1.5  colspan=totalCols
```

**Card wrapper:**

```
bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-4
```

The `overflow-x-auto` div sits inside this card wrapper.

---

### 4. Pitching table (`Scorecard.tsx`)

Same card wrapper (`rounded-2xl border shadow-sm`) applied to each pitching section. No structural changes — styling only.

---

### 5. Score header — losing team opacity (`ScorecardPage.tsx`)

The summary page dims the losing team with `opacity-60`. Apply the same to `ScorecardPage.tsx`:

```tsx
const awayWon = data.game.awayScore > data.game.homeScore
const homeWon = data.game.homeScore > data.game.awayScore

// away div: className={`flex-1 text-center ${awayWon ? '' : 'opacity-60'}`}
// home div: className={`flex-1 text-center ${homeWon ? '' : 'opacity-60'}`}
```

Also add the FINAL tag below the scores (same pattern as summary).

---

## What Does Not Change

- The `DiamondCell` and `KNBSBCell` components — no changes.
- The `useScorecardData` hook — no changes.
- The pitching data or decision badge logic — no changes.
- The style switcher (KNBSB | MLB) — no changes.
- i18n keys — section header keys already exist; no new keys needed.
