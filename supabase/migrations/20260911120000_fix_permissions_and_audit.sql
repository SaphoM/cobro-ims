-- ============================================================================
-- 20260911120000 — Production hardening: RLS function + audit trail repair
--
-- 1. Replace app_has_permission with the complete 7-role matrix that matches
--    ROLE_PERMISSIONS in src/lib/permissions.ts.  The previous version
--    contained only 4 roles; supervisor, mechanical_team_leader and
--    electrical_team_leader all fell into `else false`, silently blocking them
--    from every RLS-gated SELECT (requisitions, reports, etc.).
--
-- 2. Insert opening-balance receipt movements for existing stock-ledger rows
--    that have no matching movement history.  The seed data was inserted
--    directly into stock_ledger — the audit trail now becomes complete.
--
-- 3. Correct the roles.permissions JSON column to match the authoritative
--    in-app matrix (the column is not used by RLS but is surfaced in the
--    Admin UI and should stay in sync).
--
-- 4. Deactivate the orphaned engineer_station rows that were auto-created
--    for supervisor / mechlead / electlead users when those accounts were
--    first created with the default engineer_requester role.
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────────────
-- 1.  Replace app_has_permission
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION app_has_permission(perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE app_user_role()
    -- Admin: everything EXCEPT create_requisitions (business rule, confirmed
    -- at 8 September review — Admin replenishes via POs, not requisitions).
    WHEN 'admin' THEN
      perm IS DISTINCT FROM 'create_requisitions'

    -- Stores Manager: full operational Stores capability.
    WHEN 'stores_manager' THEN
      perm = ANY(ARRAY[
        'manage_purchase_orders',
        'manage_receiving',
        'manage_transfers',
        'request_adjustments',
        'view_requisitions',
        'manage_sales_orders',
        'view_reports',
        'view_audit_log',
        'create_product_labels'
      ])

    -- Stores Clerk: same as Manager minus request_adjustments.
    WHEN 'stores_clerk' THEN
      perm = ANY(ARRAY[
        'manage_purchase_orders',
        'manage_receiving',
        'manage_transfers',
        'view_requisitions',
        'manage_sales_orders',
        'view_reports',
        'view_audit_log',
        'create_product_labels'
      ])

    -- Engineer / Requester: can raise requisitions and return their own
    -- held stock.  No Stores-side or admin capability.
    WHEN 'engineer_requester' THEN
      perm = ANY(ARRAY[
        'create_requisitions',
        'request_stock_return',
        'view_requisitions',
        'view_reports'
      ])

    -- Supervisor: cross-team visibility only.  The 8 September review did
    -- NOT confirm approval authority, so this stays read-only.
    WHEN 'supervisor' THEN
      perm = ANY(ARRAY[
        'view_requisitions',
        'view_reports',
        'create_product_labels'
      ])

    -- Team Leaders: area-scoped visibility (scoping is applied in UI/actions,
    -- not in this function — role gives the capability, area restricts it).
    WHEN 'mechanical_team_leader' THEN
      perm = ANY(ARRAY[
        'view_requisitions',
        'view_reports'
      ])

    WHEN 'electrical_team_leader' THEN
      perm = ANY(ARRAY[
        'view_requisitions',
        'view_reports'
      ])

    ELSE false
  END
$$;


-- ──────────────────────────────────────────────────────────────────────────
-- 2.  Opening-balance receipt movements (idempotent)
--
--     For each stock_ledger row whose net movements ≠ ledger quantity, insert
--     ONE receipt movement that accounts for the missing opening stock.
--     Uses the system admin user id (first admin row) as created_by.
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_admin_id uuid;
  rec record;        -- loop variable uses 'rec' to avoid aliasing with SQL table aliases
  v_missing numeric;
BEGIN
  -- Find admin user for audit attribution
  -- Note: use alias 'rl' for roles to avoid collision with loop variable 'rec'
  SELECT u.id INTO v_admin_id
  FROM users u JOIN roles rl ON rl.id = u.role_id
  WHERE rl.name = 'admin' LIMIT 1;

  FOR rec IN
    SELECT
      sl.product_id,
      sl.warehouse_id,
      sl.weighted_average_cost,
      sl.quantity_on_hand,
      COALESCE(SUM(sm.quantity), 0) AS movement_total
    FROM stock_ledger sl
    LEFT JOIN stock_movements sm
      ON sm.product_id = sl.product_id AND sm.warehouse_id = sl.warehouse_id
    GROUP BY sl.product_id, sl.warehouse_id, sl.weighted_average_cost, sl.quantity_on_hand
    HAVING ABS(sl.quantity_on_hand - COALESCE(SUM(sm.quantity), 0)) > 0.0005
  LOOP
    v_missing := rec.quantity_on_hand - rec.movement_total;
    IF v_missing > 0 THEN
      -- Missing positive stock — insert a receipt movement for the balance.
      -- We do NOT call post_stock_movement() because the ledger is already
      -- correct; we only need the movement row for audit completeness.
      INSERT INTO stock_movements (
        product_id, warehouse_id, movement_type, quantity,
        unit_cost, reference_type, reference_id, batch_ref, created_by
      ) VALUES (
        rec.product_id,
        rec.warehouse_id,
        'receipt',
        v_missing,
        rec.weighted_average_cost,
        'opening_balance',
        NULL,
        'OPENING_BALANCE',
        v_admin_id
      );
    END IF;
    -- Negative v_missing (ledger < movements) would indicate a data error
    -- we do not silently patch — skip and leave for manual review.
  END LOOP;
END;
$$;


-- ──────────────────────────────────────────────────────────────────────────
-- 3.  Fix roles.permissions JSON to match the authoritative app matrix
-- ──────────────────────────────────────────────────────────────────────────
UPDATE roles SET permissions = '{"create_requisitions": false}'::jsonb
  WHERE name = 'admin';

UPDATE roles SET permissions = '{
  "manage_purchase_orders": true, "manage_receiving": true, "manage_transfers": true,
  "request_adjustments": true, "view_requisitions": true, "manage_sales_orders": true,
  "view_reports": true, "view_audit_log": true, "create_product_labels": true
}'::jsonb WHERE name = 'stores_manager';

UPDATE roles SET permissions = '{
  "manage_purchase_orders": true, "manage_receiving": true, "manage_transfers": true,
  "view_requisitions": true, "manage_sales_orders": true,
  "view_reports": true, "view_audit_log": true, "create_product_labels": true
}'::jsonb WHERE name = 'stores_clerk';

UPDATE roles SET permissions = '{
  "create_requisitions": true, "request_stock_return": true,
  "view_requisitions": true, "view_reports": true
}'::jsonb WHERE name = 'engineer_requester';

UPDATE roles SET permissions = '{
  "view_requisitions": true, "view_reports": true, "create_product_labels": true
}'::jsonb WHERE name = 'supervisor';

UPDATE roles SET permissions = '{"view_requisitions": true, "view_reports": true}'::jsonb
  WHERE name IN ('mechanical_team_leader', 'electrical_team_leader');


-- ──────────────────────────────────────────────────────────────────────────
-- 4.  Deactivate orphaned engineer_station rows for non-engineer users.
--     These were created by the trigger when those accounts were first
--     provisioned under the default engineer_requester role.  The stations
--     carry no stock so deactivation is safe.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE warehouses
SET is_active = false
WHERE type = 'engineer_station'
  AND owner_user_id IN (
    SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
    WHERE r.name NOT IN ('engineer_requester')
  );
