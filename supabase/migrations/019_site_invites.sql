-- 019_site_invites.sql
-- Invite-only signup gate. Toggle signups in Supabase Auth dashboard.
-- This migration adds the admin table, site_invites table, and RLS.

-- ── Site admins ───────────────────────────────────────────────────────────────

create table if not exists site_admins (
  user_id uuid primary key references auth.users on delete cascade
);

-- Insert yourself after first login:
--   insert into site_admins (user_id) values ('<your-user-id>');

alter table site_admins enable row level security;

-- Admins can see the table (needed for the is_site_admin function to work)
create policy "site_admins_self_read" on site_admins
  for select using (auth.uid() = user_id);

-- ── is_site_admin() helper ────────────────────────────────────────────────────

create or replace function is_site_admin()
  returns boolean
  language sql
  security definer
  stable
  as $$
    select exists (
      select 1 from site_admins where user_id = auth.uid()
    )
  $$;

-- ── Site invites ──────────────────────────────────────────────────────────────

create table if not exists site_invites (
  token       uuid primary key default gen_random_uuid(),
  email       text not null,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at  timestamptz not null default now() + interval '7 days'
);

alter table site_invites enable row level security;

-- Only site admins can create invites
create policy "site_invites_admin_insert" on site_invites
  for insert with check (is_site_admin());

-- Only site admins can read/manage invites
create policy "site_invites_admin_select" on site_invites
  for select using (is_site_admin());

create policy "site_invites_admin_update" on site_invites
  for update using (is_site_admin());

create policy "site_invites_admin_delete" on site_invites
  for delete using (is_site_admin());

-- Public read for a specific token (used by the Edge Function via service role,
-- and by the /signup/:token page to show invite info before account creation)
create policy "site_invites_public_token_read" on site_invites
  for select using (true);
