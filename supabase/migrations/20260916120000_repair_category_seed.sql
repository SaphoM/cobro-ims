-- Seed the built-in "Repair items" product category.
-- This activates the existing product_categories / category_id FK that was
-- already in the schema but never populated. Repair items are ordinary
-- products with this categoryId set — they flow through all existing
-- requisition, issue, transfer, and scan-to-use workflows unchanged.
--
-- The row was inserted directly into the live database via the Supabase
-- REST API (service-role client) on 2026-09-16, following the same pattern
-- used for the role seed in 20260911000000_label_permission_and_seed_roles.sql.
-- This migration records that insert as an idempotent upsert (ON CONFLICT DO
-- NOTHING) so a fresh `supabase db push` / `db reset` reproduces it.
--
-- The UUID is a valid Postgres uuid (product_categories.id is `uuid`, not
-- text) and is stable so the mock's REPAIR_CATEGORY_ID constant in
-- src/lib/data/mock/repositories.ts matches without a lookup.

insert into product_categories (id, name, parent_id)
values ('00000000-0000-0000-0000-000000000001', 'Repair items', null)
on conflict (id) do nothing;
