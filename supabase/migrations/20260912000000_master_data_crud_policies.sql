-- Admin edit/delete for master data (products, suppliers, departments).
-- Adds the RLS policies that back the new update/delete flows, gated on the
-- SAME permissions the Server Actions check, so the database is the real
-- authorization boundary (a non-admin cannot edit/delete by calling PostgREST
-- directly). Nothing here weakens existing SELECT/INSERT policies.

-- Products: SELECT/INSERT/UPDATE already exist (UPDATE = manage_catalogue).
-- Add DELETE, same permission as edit.
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete to public
  using (app_has_permission('manage_catalogue'));

-- Suppliers: previously SELECT + INSERT only. Add UPDATE + DELETE.
drop policy if exists suppliers_update on public.suppliers;
create policy suppliers_update on public.suppliers
  for update to public
  using (app_has_permission('manage_suppliers'));

drop policy if exists suppliers_delete on public.suppliers;
create policy suppliers_delete on public.suppliers
  for delete to public
  using (app_has_permission('manage_suppliers'));

-- Customers (labelled "Departments" in the UI): previously SELECT + INSERT.
-- Add UPDATE + DELETE.
drop policy if exists customers_update on public.customers;
create policy customers_update on public.customers
  for update to public
  using (app_has_permission('manage_customers'));

drop policy if exists customers_delete on public.customers;
create policy customers_delete on public.customers
  for delete to public
  using (app_has_permission('manage_customers'));
