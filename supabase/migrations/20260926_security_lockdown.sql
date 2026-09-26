-- CZR BHS87 Reunion — security lockdown (2026-09-26)
-- * Hidden admin list and test-account list in a non-API schema.
-- * Member emails and organizer emails are no longer readable by the public API.
-- * Only email-link sign-ins count as proof of an email address
--   (password sign-ins are accepted only for listed test accounts).
-- * Event plans, settings, activities, and chat links are admin/organizer-only for changes.
-- * Test-account entries are hidden from everyone except that account and admins.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.admin_accounts (email text primary key check (email = lower(email)));
create table if not exists private.test_accounts (email text primary key check (email = lower(email)));
revoke all on private.admin_accounts, private.test_accounts from public, anon, authenticated;

insert into private.admin_accounts (email) values ('czr-bhs87@outlook.com'), ('stcloud6@gmail.com') on conflict do nothing;
insert into private.test_accounts (email) values ('czr.tester@example.com') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so they can read the private lists; they
-- only ever describe the caller, never anyone else).
-- ---------------------------------------------------------------------------
create or replace function public.app_current_email() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when auth.uid() is null or coalesce(auth.jwt() ->> 'email', '') = '' then null
    when exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(auth.jwt() -> 'amr') = 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end) m
      where m ->> 'method' in ('otp', 'magiclink', 'email/signup', 'invite', 'recovery', 'email_change')
    ) then lower(auth.jwt() ->> 'email')
    when exists (select 1 from private.test_accounts t where t.email = lower(auth.jwt() ->> 'email')) then lower(auth.jwt() ->> 'email')
    else null
  end
$$;

create or replace function public.app_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.admin_accounts a where a.email = public.app_current_email())
$$;

create or replace function public.app_is_test_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from private.test_accounts t where t.email = lower(coalesce(auth.jwt() ->> 'email', '')))
$$;

create or replace function public.app_leads_activity(p_activity_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cluster_leads l
    where l.activity_id = p_activity_id
      and public.app_current_email() is not null
      and lower(l.lead_email) = public.app_current_email()
  )
$$;

-- ---------------------------------------------------------------------------
-- people
-- ---------------------------------------------------------------------------
alter table public.people add column if not exists is_test boolean not null default false;

create or replace function public.people_mark_test_rows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.is_test := exists (select 1 from private.test_accounts t where t.email = lower(coalesce(new.email, '')));
  return new;
end $$;
revoke execute on function public.people_mark_test_rows() from public, anon, authenticated;
drop trigger if exists people_mark_test_rows on public.people;
create trigger people_mark_test_rows before insert or update on public.people
  for each row execute function public.people_mark_test_rows();

revoke select, insert, update, delete on public.people from anon, authenticated;
grant select (id, name, arrival, departure, slots, interests, updated_at, attending, volunteer_support, volunteer_lead, yacht_paid, mievento_intents, mievento_ticket_status, is_test)
  on public.people to anon, authenticated;
grant insert (name, email, arrival, departure, slots, interests, updated_at, attending, volunteer_support, volunteer_lead, yacht_paid, mievento_intents, mievento_ticket_status)
  on public.people to anon, authenticated;
grant update (name, email, arrival, departure, slots, interests, updated_at, attending, volunteer_support, volunteer_lead, yacht_paid, mievento_intents, mievento_ticket_status)
  on public.people to authenticated;
grant delete on public.people to authenticated;

drop policy if exists people_public_read on public.people;
drop policy if exists people_read on public.people;
create policy people_read on public.people for select to anon, authenticated
  using (not is_test or lower(email) = public.app_current_email());

drop policy if exists people_owner_update on public.people;
create policy people_owner_update on public.people for update to authenticated
  using (lower(email) = public.app_current_email())
  with check (lower(email) = public.app_current_email());

drop policy if exists people_owner_delete on public.people;
create policy people_owner_delete on public.people for delete to authenticated
  using (lower(email) = public.app_current_email());
-- people_public_insert (anyone may add a brand-new entry) is kept as-is.

-- ---------------------------------------------------------------------------
-- cluster_leads (organizer email hidden; changes by admin or that organizer)
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete on public.cluster_leads from anon, authenticated;
grant select (id, activity_id, lead_name, created_at, chat_link) on public.cluster_leads to anon, authenticated;
grant insert (activity_id, lead_name, lead_email, chat_link) on public.cluster_leads to authenticated;
grant update (lead_name, lead_email, chat_link) on public.cluster_leads to authenticated;

drop policy if exists anon_insert_cluster_leads on public.cluster_leads;
drop policy if exists anon_update_cluster_leads on public.cluster_leads;
drop policy if exists cluster_leads_admin_insert on public.cluster_leads;
drop policy if exists cluster_leads_update on public.cluster_leads;
create policy cluster_leads_admin_insert on public.cluster_leads for insert to authenticated
  with check (public.app_is_admin());
create policy cluster_leads_update on public.cluster_leads for update to authenticated
  using (public.app_is_admin() or public.app_leads_activity(activity_id))
  with check (public.app_is_admin() or public.app_leads_activity(activity_id));

-- Volunteering stays open to everyone, but only claims an event with no organizer yet.
create or replace function public.volunteer_as_lead(p_activity_id text, p_lead_name text, p_lead_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_lead_name, ''));
  v_email text := lower(btrim(coalesce(p_lead_email, '')));
begin
  if public.app_is_test_account() then
    raise exception 'The test account cannot volunteer as a public Event Organizer.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_activity_id), '') = '' or length(p_activity_id) > 120 then raise exception 'Invalid event.'; end if;
  if v_name = '' or length(v_name) > 120 then raise exception 'Please enter your name.'; end if;
  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 254 then raise exception 'Please enter a valid email.'; end if;
  insert into public.cluster_leads (activity_id, lead_name, lead_email)
  values (p_activity_id, v_name, v_email)
  on conflict (activity_id) do update
    set lead_name = excluded.lead_name, lead_email = excluded.lead_email
    where public.cluster_leads.lead_name is null or btrim(public.cluster_leads.lead_name) = '';
  if not found then
    raise exception 'This event already has an Event Organizer.' using errcode = '23505';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- event_plans (admin, or the event's organizer after email sign-in)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.event_plans from anon, authenticated;
grant insert, delete on public.event_plans to authenticated;
grant update (status, event_date, start_time, venue, max_size, cost, notes, updated_by, updated_at) on public.event_plans to authenticated;

drop policy if exists anon_write_event_plans on public.event_plans;
drop policy if exists anon_update_event_plans on public.event_plans;
drop policy if exists anon_delete_event_plans on public.event_plans;
drop policy if exists event_plans_admin_insert on public.event_plans;
drop policy if exists event_plans_editor_update on public.event_plans;
drop policy if exists event_plans_admin_delete on public.event_plans;
create policy event_plans_admin_insert on public.event_plans for insert to authenticated with check (public.app_is_admin());
create policy event_plans_editor_update on public.event_plans for update to authenticated
  using (public.app_is_admin() or public.app_leads_activity(activity_id))
  with check (public.app_is_admin() or public.app_leads_activity(activity_id));
create policy event_plans_admin_delete on public.event_plans for delete to authenticated using (public.app_is_admin());

-- Never let an email address leak into the public "updated by" field.
create or replace function public.event_plans_stamp_editor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null then
    new.updated_at := now();
    if public.app_is_admin() then
      new.updated_by := 'Maintenance';
    else
      new.updated_by := coalesce((select l.lead_name from public.cluster_leads l where l.activity_id = new.activity_id), 'Event Organizer');
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.event_plans_stamp_editor() from public, anon, authenticated;
drop trigger if exists event_plans_stamp_editor on public.event_plans;
create trigger event_plans_stamp_editor before insert or update on public.event_plans
  for each row execute function public.event_plans_stamp_editor();

-- ---------------------------------------------------------------------------
-- activities / cluster_resources (suggestions stay open; edits admin-only)
-- ---------------------------------------------------------------------------
drop policy if exists "anon full access activities" on public.activities;
revoke update, delete on public.activities from anon;
drop policy if exists activities_public_insert on public.activities;
create policy activities_public_insert on public.activities for insert to anon, authenticated
  with check (not public.app_is_test_account());
drop policy if exists activities_admin_update on public.activities;
drop policy if exists activities_admin_delete on public.activities;
create policy activities_admin_update on public.activities for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());
create policy activities_admin_delete on public.activities for delete to authenticated using (public.app_is_admin());

revoke update, delete on public.cluster_resources from anon, authenticated;
grant delete on public.cluster_resources to authenticated;
drop policy if exists "cluster_resources insert" on public.cluster_resources;
create policy "cluster_resources insert" on public.cluster_resources for insert to anon, authenticated
  with check (not public.app_is_test_account());
drop policy if exists cluster_resources_admin_delete on public.cluster_resources;
create policy cluster_resources_admin_delete on public.cluster_resources for delete to authenticated using (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_settings (admin only)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.app_settings from anon;
drop policy if exists app_settings_public_insert on public.app_settings;
drop policy if exists app_settings_public_update on public.app_settings;
drop policy if exists app_settings_admin_insert on public.app_settings;
drop policy if exists app_settings_admin_update on public.app_settings;
create policy app_settings_admin_insert on public.app_settings for insert to authenticated with check (public.app_is_admin());
create policy app_settings_admin_update on public.app_settings for update to authenticated
  using (public.app_is_admin()) with check (public.app_is_admin());

-- site_visits: anonymous visit counter only; no edits or deletes.
revoke update, delete on public.site_visits from anon, authenticated;

-- No API role needs these on any app table.
revoke truncate, references, trigger on public.people, public.activities, public.cluster_leads, public.cluster_resources,
  public.event_plans, public.app_settings, public.site_visits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs for the app
-- ---------------------------------------------------------------------------
create or replace function public.my_entry() returns setof public.people
language sql stable security definer set search_path = '' as $$
  select p.* from public.people p
  where public.app_current_email() is not null and lower(p.email) = public.app_current_email()
  order by p.updated_at desc nulls last
  limit 1
$$;

create or replace function public.my_led_activities() returns setof text
language sql stable security definer set search_path = '' as $$
  select l.activity_id from public.cluster_leads l
  where public.app_current_email() is not null and lower(l.lead_email) = public.app_current_email()
$$;

create or replace function public.entry_email_taken(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.people p where lower(p.email) = lower(btrim(coalesce(p_email, ''))) and not p.is_test)
$$;

create or replace function public.admin_member_directory()
returns table (id uuid, name text, email text, attending boolean, is_test boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.app_is_admin() then
    raise exception 'Admin sign-in required.' using errcode = '42501';
  end if;
  return query
    select p.id, p.name, p.email, p.attending, p.is_test, p.updated_at
    from public.people p
    order by p.is_test, lower(p.name);
end $$;

revoke execute on function public.admin_member_directory() from public, anon;
grant execute on function public.admin_member_directory() to authenticated;
revoke execute on function public.my_entry(), public.my_led_activities() from public, anon;
grant execute on function public.my_entry(), public.my_led_activities() to authenticated;
grant execute on function public.app_current_email(), public.app_is_admin(), public.app_is_test_account(),
  public.app_leads_activity(text), public.entry_email_taken(text), public.volunteer_as_lead(text, text, text) to anon, authenticated;
