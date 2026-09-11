-- Real MFA enforcement (B3): the privileged-permission DB backstop now
-- requires a genuine second factor for the CURRENT session — the Supabase
-- Auth assurance level (aal2) carried on the request JWT — instead of the old
-- mock `users.mfa_enrolled` boolean that any code could flip.
--
-- Effect: the stock_adjustments UPDATE policy (approving/rejecting an
-- adjustment — the one action that posts a WAC-affecting movement with no
-- second approver) can only succeed when the caller has completed TOTP MFA
-- this session. This holds even if the Server Action layer's check were
-- bypassed, because the user-scoped client carries the real aal claim.

create or replace function app_has_privileged_permission(perm text)
returns boolean
language sql
stable
as $$
  select app_has_permission(perm)
    and (
      perm is distinct from 'approve_adjustments'
      -- aal2 = the user verified their TOTP factor in this session.
      or coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    )
$$;

comment on function app_has_privileged_permission(text) is
  'RBAC check for privileged permissions. approve_adjustments additionally '
  'requires the current session to be AAL2 (real TOTP MFA verified), read '
  'from the request JWT aal claim — not a stored boolean.';
