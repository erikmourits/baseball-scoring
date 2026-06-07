-- Add secondary_positions array; drop lineup_order (lineup is per-game, not per-player)

alter table public.players
  add column if not exists secondary_positions text[] not null default '{}';

alter table public.players
  drop column if exists lineup_order;
