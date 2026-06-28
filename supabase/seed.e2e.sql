-- E2E test fixtures for local CI. Runs against a local Supabase instance only.

\set ON_ERROR_STOP on

-- Test user (email/password auth via pgcrypto's crypt)
-- instance_id must be '00000000-...' - GoTrue filters users by this field.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'e2e00000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'e2e@test.local',
  crypt('e2e-test-password', gen_salt('bf', 10)),
  now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}',
  '{"email_verified":true}',
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
