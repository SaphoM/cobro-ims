-- ============================================================================
-- Cobro IMS — RFQ Phase 6 (partial): audit log immutability at the DB level
--
-- STATUS: schema-as-code only, same as every prior migration — not yet
-- applied to any live Supabase project.
--
-- RFQ requirement, verbatim: "No record in the audit log may be deleted or
-- modified — enforced at the database level." The mock repository
-- (src/lib/data/mock/repositories.ts) already only exposes `write`/`list` —
-- no update or delete method exists for any caller to call — but that's an
-- application-layer guarantee. This migration is the actual database-level
-- enforcement: a trigger that raises on any UPDATE or DELETE against
-- audit_log, regardless of which role or connection attempts it.
-- ============================================================================

create or replace function reject_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted (record id: %)', TG_OP,
    coalesce(old.id, new.id);
end;
$$;

create trigger audit_log_no_update
  before update on audit_log
  for each row execute function reject_audit_log_mutation();

create trigger audit_log_no_delete
  before delete on audit_log
  for each row execute function reject_audit_log_mutation();

-- Belt-and-braces: even a role that somehow bypasses RLS policies still
-- can't UPDATE/DELETE rows it has no grant for. Application roles should be
-- granted INSERT and SELECT on audit_log only, never UPDATE or DELETE.
-- (Exact role/grant setup depends on the Supabase project's auth schema,
-- which doesn't exist yet — see docs/ARCHITECTURE.md §2.)
