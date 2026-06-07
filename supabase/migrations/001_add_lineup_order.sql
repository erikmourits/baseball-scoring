-- Add lineup_order to players table
-- Run this in the Supabase SQL editor if you've already run the initial schema.sql

alter table public.players
  add column if not exists lineup_order integer not null default 0;
