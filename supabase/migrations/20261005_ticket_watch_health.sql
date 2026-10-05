-- 2026-10-05: ticket-watch health + page-change detection. Additive columns only.
alter table public.ticket_watch_runs
  add column if not exists health        text,      -- ok | warning | action
  add column if not exists warnings      text[],
  add column if not exists http_status   integer,
  add column if not exists page_bytes    integer,
  add column if not exists dates         integer,   -- MiEvento date blocks read
  add column if not exists priced        integer,   -- tickets with a price
  add column if not exists timed         integer,   -- tickets with a time
  add column if not exists content_hash  text,      -- fingerprint of the ticket data
  add column if not exists layout_hash   text,      -- fingerprint of the page structure
  add column if not exists layout_tokens text[],    -- structure markers behind layout_hash
  add column if not exists layout_changed boolean;
grant select (health, warnings, dates, layout_changed) on public.ticket_watch_runs to anon, authenticated;
