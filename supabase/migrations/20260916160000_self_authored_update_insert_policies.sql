-- Fix: the previous migration (20260916150000) added SELECT-only
-- self-policies, which only widens what a RETURNING clause can hand back.
-- It does NOT touch Postgres' separate UPDATE/INSERT policy categories -
-- confirmed live: after that migration, sales_orders.dispatch()'s own
-- `.update({status:'dispatched',...}).eq('id', orderId).select().single()`
-- (src/lib/data/supabase/repositories.ts) still failed with "Cannot coerce
-- the result to a single JSON object" for an Engineer accepting their own
-- requisition - because the UPDATE's WHERE/USING match is evaluated before
-- RETURNING ever comes into it. With no self-authored UPDATE policy on
-- sales_orders, the ad-hoc existing policy (gated on manage_sales_orders,
-- which engineer_requester never holds) matches zero rows for this session,
-- so the update is silently a no-op and RETURNING has nothing to give back.
--
-- The stock itself already moved by this point in dispatch() - those calls
-- use the service-role client (see postMovement, adjustReserved), so they
-- are unaffected by any of this and already committed on every failed
-- attempt. Only the requisition's own status update was ever blocked.
--
-- Applying the same self-authored carve-out to inter_warehouse_transfers'
-- INSERT up front too, on the same reasoning, since transferRepository
-- .initiate() (Return to Stores) has the identical user-scoped
-- .insert({...}).select().single() shape and very likely has the same gap
-- one level up (INSERT's WITH CHECK, not just SELECT) for the same reason.

create policy sales_orders_self_update on public.sales_orders
  for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy inter_warehouse_transfers_self_insert on public.inter_warehouse_transfers
  for insert
  to authenticated
  with check (initiated_by = auth.uid());
