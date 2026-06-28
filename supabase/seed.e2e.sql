-- E2E test fixtures: one league owned by the test user.
-- The test user is created separately via the Supabase Admin API
-- with the fixed UUID below before this file is run.

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
