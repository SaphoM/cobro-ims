-- ============================================================================
-- Cobro IMS — Stores Manager & Stores Clerk may add products to the catalogue
--
-- STATUS: schema-as-code only. Not yet applied to any live Supabase project.
-- Per project policy, this migration must be reviewed and approved before
-- running against any real database. See CHANGELOG.md and AGENTS.md.
--
-- The application's authoritative RBAC matrix (src/lib/permissions.ts) gains a
-- dedicated `create_products` permission, granted to stores_manager and
-- stores_clerk (and Admin via '*') but NOT edit/delete/bulk-import/BOM
-- (`manage_catalogue`). This migration keeps the descriptive `roles.permissions`
-- JSON in sync with that matrix for any freshly provisioned database.
-- ============================================================================

UPDATE roles SET permissions = permissions || '{"create_products": true}'::jsonb
  WHERE name IN ('stores_manager', 'stores_clerk');
