-- Fix: audit_log INSERT was gated on `view_audit_log`, blocking self-service
-- writes from roles that can act but not read the log.
--
-- Found during Repair Items regression testing (2026-09-16): three
-- Engineer/Requester self-service actions each commit a real stock mutation
-- and then try to log it as themselves:
--   - Scan-to-Use (src/app/dashboard/scan/actions.ts, postScanAction)
--   - Accepting your own requisition (src/app/dashboard/sales/actions.ts,
--     dispatchSalesOrderAction's self-service path)
--   - Return to Stores (src/app/dashboard/actions.ts,
--     requestReturnToStoresAction)
-- `engineer_requester` (and supervisor/team-leader) do not hold
-- `view_audit_log`, so if the live audit_log INSERT policy checks that
-- permission, the audit write is rejected AFTER the stock movement/transfer
-- already committed - the action reports failure to the user while the
-- database silently already changed. This was reproduced live: a Scan-to-Use
-- call decremented a station's ledger by 1 while the UI showed a red
-- "FAILED - new row violates row-level security policy for table
-- audit_log" error.
--
-- The fix is the rule the audit_log_immutability migration's own comment
-- already states as intended: "Application roles should be granted INSERT
-- and SELECT on audit_log only" - i.e. any authenticated user may log an
-- entry attributed to themselves, regardless of whether they may also READ
-- the log. This does not touch the existing UPDATE/DELETE-blocking triggers
-- and does not let anyone log an entry as someone else.
--
-- NOTE: this only replaces the INSERT policy. If the live project's actual
-- policy differs from `audit_log_insert` in name, both may end up present -
-- harmless (Postgres OR's every applicable policy for a role), but drop the
-- stale one by its real name once confirmed.

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (changed_by = auth.uid());
