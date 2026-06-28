-- E2E test fixtures for local CI. Runs against a local Supabase instance only.

-- Test user (email/password auth via pgcrypto's crypt)
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'e2e00000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'e2e@test.local',
  crypt('e2e-test-password', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
);

-- League owned by the test user
insert into leagues (id, name, created_by)
values (
  'e2e00000-0000-0000-0000-000000000001',
  'E2E Test League',
  'e2e00000-0000-0000-0000-000000000000'
);

insert into league_members (league_id, user_id, role)
values (
  'e2e00000-0000-0000-0000-000000000001',
  'e2e00000-0000-0000-0000-000000000000',
  'owner'
);
