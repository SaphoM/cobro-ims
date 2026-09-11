-- ============================================================================
-- Label-permission column + missing role/user seed
--
-- Adds the `label_permission` column that the application domain type
-- (src/lib/domain/inventory.ts User.labelPermission) and repository
-- (setLabelPermission in src/lib/data/supabase/repositories.ts) require.
-- Without this column, every call to updateUserLabelPermissionAction throws
-- a 42703 (undefined column) error.
--
-- The three newer roles (supervisor, mechanical_team_leader,
-- electrical_team_leader — added in v0.42.0) and their corresponding demo
-- users have already been seeded into the production database on 2026-09-11
-- via the Supabase REST + Auth Admin APIs.  This migration records those
-- inserts as idempotent upserts so a fresh `supabase db reset` or a second
-- `db push` does not break.
-- ============================================================================

-- 1. Add label_permission to users (idempotent)
alter table users
  add column if not exists label_permission text not null default 'inherited'
    check (label_permission in ('inherited', 'allowed', 'revoked'));

-- 2. Seed missing roles (idempotent — ON CONFLICT DO NOTHING)
insert into roles (name, description, permissions) values
  ('supervisor',
   'Supervisor',
   '{"view_requisitions": true, "view_reports": true, "create_product_labels": true}'::jsonb),
  ('mechanical_team_leader',
   'Mechanical Team Leader',
   '{"view_requisitions": true, "view_reports": true}'::jsonb),
  ('electrical_team_leader',
   'Electrical Team Leader',
   '{"view_requisitions": true, "view_reports": true}'::jsonb)
on conflict (name) do nothing;

-- Note: the three demo users (supervisor@, mechlead@, electlead@) were
-- created via the Supabase Admin Auth API on 2026-09-11 and are therefore
-- already present in both auth.users and public.users in the production
-- database.  A `supabase db push` on a FRESH project would not insert them
-- (that requires the Auth API or a manual step), so those accounts would
-- need to be created manually on any new environment.  Document this in the
-- project's ARCHITECTURE.md or README under "Initial seed".
