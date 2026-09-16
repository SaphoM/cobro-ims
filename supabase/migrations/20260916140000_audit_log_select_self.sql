-- Fix: audit_log_select (an ad-hoc policy never captured in a migration)
-- gated SELECT on `view_audit_log`, which broke every self-service write.
--
-- `sbAuditLogRepository.write()` (src/lib/data/supabase/repositories.ts)
-- does `.insert({...}).select().single()`, i.e. INSERT ... RETURNING *.
-- Postgres evaluates SELECT policies against a row before it can be
-- returned from an INSERT, in addition to the INSERT policy's WITH CHECK.
-- audit_log_insert (fixed in 20260916130000) was already correct - the
-- remaining failure was audit_log_select rejecting the RETURNING row for
-- any role without `view_audit_log` (engineer_requester, supervisor, team
-- leaders), surfacing as the identical generic error: "new row violates
-- row-level security policy for table audit_log".
--
-- Per this table's own original design intent (see the comment already in
-- audit_log_immutability.sql): "Application roles should be granted INSERT
-- and SELECT on audit_log only". Who may browse the full log through the
-- UI is - and remains - enforced at the application layer (`view_audit_log`
-- permission gates the /dashboard/audit-log nav entry and page); this
-- policy only needs to stop anonymous/unauthenticated access at the DB
-- layer, not re-implement that same business permission a second time.

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select
  to authenticated
  using (true);
