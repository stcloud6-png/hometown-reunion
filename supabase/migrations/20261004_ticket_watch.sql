-- 2026-10-04: MiEvento ticket watch. Additive only — no existing table is touched.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.ticket_watch (
  watch_key      text primary key,          -- "<miEvento date id>|<ticket name>"
  ticket_id      text,
  event_date     date not null,
  name           text not null,
  price          numeric,
  time_text      text,
  status         text not null,             -- available | sold_out | other label
  status_label   text,
  max_qty        integer,                   -- MiEvento purchase limit (drops below the usual cap when few are left)
  prev_status    text,
  prev_max_qty   integer,
  first_seen     timestamptz not null default now(),
  sold_out_since timestamptz,
  last_seen      timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.ticket_watch_runs (
  id       bigserial primary key,
  ran_at   timestamptz not null default now(),
  ok       boolean not null,
  tickets  integer,
  sold_out integer,
  error    text
);

alter table public.ticket_watch enable row level security;
alter table public.ticket_watch_runs enable row level security;
revoke all on public.ticket_watch, public.ticket_watch_runs from anon, authenticated;
grant select on public.ticket_watch to anon, authenticated;
grant select (ran_at, ok, tickets, sold_out) on public.ticket_watch_runs to anon, authenticated;
drop policy if exists ticket_watch_read on public.ticket_watch;
create policy ticket_watch_read on public.ticket_watch for select to anon, authenticated using (true);
drop policy if exists ticket_watch_runs_read on public.ticket_watch_runs;
create policy ticket_watch_runs_read on public.ticket_watch_runs for select to anon, authenticated using (true);
-- Writes happen only from the ticket-watch Edge Function (service role bypasses RLS).
