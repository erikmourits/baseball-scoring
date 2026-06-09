-- 018_app_config.sql
-- Stores global app configuration. Used for client version gating.

create table if not exists app_config (
  key   text primary key,
  value text not null
);

-- Seed minimum required client version
insert into app_config (key, value)
  values ('minimum_client_version', '1.0.0')
  on conflict (key) do nothing;

-- Public read — no auth needed (clients check this before/during sync)
alter table app_config enable row level security;

drop policy if exists "app_config_public_read" on app_config;
create policy "app_config_public_read" on app_config
  for select using (true);
