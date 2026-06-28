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

-- Identity record required by GoTrue v2 for email/password sign-in
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  'e2e@test.local',
  'e2e00000-0000-0000-0000-000000000000',
  '{"sub":"e2e00000-0000-0000-0000-000000000000","email":"e2e@test.local","email_verified":true,"provider":"email"}',
  'email',
  now(), now(), now()
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
