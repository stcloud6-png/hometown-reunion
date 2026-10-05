-- 2026-09-26b: admin can hide fake/duplicate entries (reversible, never deletes);
-- admin-account entries are treated like the test account (never in group results).

alter table public.people add column if not exists hidden boolean not null default false;
-- `hidden` is intentionally NOT granted for insert/update to anon/authenticated:
-- only the admin RPC below can change it.
grant select (hidden) on public.people to anon, authenticated;

create or replace function public.people_mark_test_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.is_test := exists (select 1 from private.test_accounts t where t.email = lower(coalesce(new.email, '')))
              or exists (select 1 from private.admin_accounts a where a.email = lower(coalesce(new.email, '')));
  return new;
end $$;
revoke execute on function public.people_mark_test_rows() from public, anon, authenticated;

drop policy if exists people_read on public.people;
create policy people_read on public.people for select to anon, authenticated
  using ((not is_test and not hidden) or lower(email) = public.app_current_email());

-- Signing in with a hidden entry's email should still find that entry, so the
-- "email already used" check keeps counting hidden (non-test) rows.

drop function if exists public.admin_member_directory();
create function public.admin_member_directory()
returns table (id uuid, name text, email text, attending boolean, is_test boolean, hidden boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin sign-in required.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.email, p.attending, p.is_test, p.hidden, p.updated_at
    from public.people p
    order by p.is_test, p.hidden, lower(p.name);
end $$;
revoke execute on function public.admin_member_directory() from public, anon;
grant execute on function public.admin_member_directory() to authenticated;

create or replace function public.admin_set_member_hidden(p_id uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin sign-in required.' using errcode = '42501';
  end if;
  update public.people set hidden = coalesce(p_hidden, false) where id = p_id;
  if not found then raise exception 'Entry not found.'; end if;
end $$;
revoke execute on function public.admin_set_member_hidden(uuid, boolean) from public, anon;
grant execute on function public.admin_set_member_hidden(uuid, boolean) to authenticated;
