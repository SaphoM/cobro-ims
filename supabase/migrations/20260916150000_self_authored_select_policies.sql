-- Fix: same RLS+RETURNING gap as audit_log_select, on two more tables hit
-- by the same three Engineer self-service actions.
--
-- sbSalesOrderRepository.dispatch() (src/lib/data/supabase/repositories.ts)
-- ends with `.from('sales_orders').update({status:'dispatched',...}).select()
-- .single()`. The stock movements it posts earlier in the same call use the
-- service-role client and always succeed - but this final call uses the
-- user-scoped client, so Postgres evaluates sales_orders' SELECT policy
-- against the row before it can be returned. An engineer_requester
-- self-accepting their OWN requisition (dispatchSalesOrderAction's
-- `before.createdBy === session.id` path) has no ad-hoc SELECT policy
-- granting that, so the row silently moves (stock already transferred) but
-- the status update appears to fail with the generic PostgREST error
-- "Cannot coerce the result to a single JSON object" (0 rows returned).
--
-- transferRepository.initiate() (same file) has the identical shape:
-- `.from('inter_warehouse_transfers').insert({...}).select().single()` on
-- the user-scoped client - hit by requestReturnToStoresAction, the
-- Engineer's "Return to Stores" self-service action.
--
-- Both fixes are additive only (no DROP): PostgreSQL OR's every applicable
-- PERMISSIVE policy for a role, so adding "you can always read a row you
-- authored yourself" here only ever widens access - it cannot narrow
-- whatever broader policy (`view_requisitions`, `manage_transfers`, etc.)
-- already exists gating who can browse OTHER people's rows.

create policy sales_orders_self_select on public.sales_orders
  for select
  to authenticated
  using (created_by = auth.uid());

create policy inter_warehouse_transfers_self_select on public.inter_warehouse_transfers
  for select
  to authenticated
  using (initiated_by = auth.uid());
