-- Fix: same self-service INSERT gap, one table deeper, on
-- inter_warehouse_transfer_lines - and it was masked by a real code bug.
--
-- transferRepository.initiate() (src/lib/data/supabase/repositories.ts)
-- inserts the transfer header into inter_warehouse_transfers (already fixed
-- in 20260916160000), then inserts a matching row into
-- inter_warehouse_transfer_lines "for complete() to read later" - but that
-- second insert never checked its own error. Reproduced live: an Engineer's
-- Return to Stores created the transfer header fine (self-insert policy
-- already covered it) and the stock genuinely left their station
-- (postMovement is service-role), but the line insert was rejected by RLS
-- (no policy at all let a non-Stores role write here) and the failure was
-- silently swallowed - initiate() returned success. The transfer then sat
-- forever in "in_transit": complete() unconditionally requires exactly one
-- matching line row and throws "Transfer line details missing - cannot
-- complete" otherwise, so Stores could never receive it. The missing error
-- check is fixed in the same commit as this migration so a future RLS gap
-- like this fails loudly at initiate() instead of corrupting silently.
--
-- Scope: a line may only be inserted for a transfer this same user just
-- initiated - mirrors inter_warehouse_transfers_self_insert but expressed
-- via the parent row, since transfer_lines carries no author column of its
-- own.

create policy inter_warehouse_transfer_lines_self_insert on public.inter_warehouse_transfer_lines
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.inter_warehouse_transfers t
      where t.id = transfer_id and t.initiated_by = auth.uid()
    )
  );
