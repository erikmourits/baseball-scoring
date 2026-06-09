-- 020_site_invites_name.sql
-- Replace email-based invites with name-based invites.
-- The invitee chooses their own email when they follow the link.

alter table site_invites
  add column if not exists name text;

-- Carry over any existing email values into name so old rows aren't broken
update site_invites set name = email where name is null and email is not null;

alter table site_invites
  alter column name set not null;

alter table site_invites
  drop column if exists email;
