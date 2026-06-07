-- Store email directly on team_members so it's readable without joining auth.users
alter table team_members add column if not exists email text;

-- Backfill email for existing members from auth.users
update team_members tm
set email = u.email
from auth.users u
where u.id = tm.user_id;
