// Placeholder — replace with output of `npx supabase gen types typescript` after schema stabilises.
// Using Record<string, unknown> for all rows so we can pass any shape without TS errors.
// The as-any casts in service files handle the actual runtime safety.

type AnyRow = Record<string, unknown>
type AnyTable = { Row: AnyRow; Insert: AnyRow; Update: AnyRow }

export type Database = {
  public: {
    Tables: {
      teams:              AnyTable
      players:            AnyTable
      seasons:            AnyTable
      games:              AnyTable
      game_lineups:       AnyTable
      innings:            AnyTable
      at_bats:            AnyTable
      fielding_credits:   AnyTable
      baserunning_events: AnyTable
      pitching_lines:     AnyTable
    }
    Views:     Record<string, never>
    Functions: Record<string, never>
    Enums:     Record<string, never>
  }
}
