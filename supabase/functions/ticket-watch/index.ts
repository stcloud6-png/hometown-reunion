// Ticket watch — reads the public MiEvento CZR2027 page once a day and stores a
// snapshot of each ticket's status (available / sold out / other) and the
// purchase limit MiEvento exposes. Read-only toward MiEvento; writes only the
// ticket_watch tables. Triggered by pg_cron (see migration 20261004_ticket_watch.sql).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_URL = "https://www.mieventos.com/event-multiple-detail/czr-2027";
const MIN_MINUTES_BETWEEN_RUNS = 30;

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&minus;/g, "-")
    .replace(/\s+/g, " ").trim();
}

function toIsoDate(text: string): string | null {
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  if (!m) return null;
  const mm = MONTHS[m[1].toLowerCase()];
  return mm ? `${m[3]}-${mm}-${m[2].padStart(2, "0")}` : null;
}

export interface ParsedTicket {
  watch_key: string;
  ticket_id: string | null;
  event_date: string;
  name: string;
  price: number | null;
  time_text: string | null;
  status: string;        // "available" | "sold_out" | other lowercase label
  status_label: string;  // as shown on MiEvento
  max_qty: number | null;
}

export function parsePage(html: string): ParsedTicket[] {
  const out: ParsedTicket[] = [];
  const blocks = html.split(/<div class="ep-acc" data-eid="/).slice(1);
  for (const block of blocks) {
    const eid = block.slice(0, block.indexOf('"'));
    const dayMatch = block.match(/<span class="ep-date-day">([^<]+)<\/span>/);
    const eventDate = dayMatch ? toIsoDate(dayMatch[1]) : null;
    if (!eventDate) continue;
    const rows = block.split(/<div class="ep-acc-row">/).slice(1);
    for (const row of rows) {
      const nameMatch = row.match(/<span class="ep-acc-tname">([\s\S]*?)<b>\s*\$?([\d.,]+)?[\s\S]*?<\/b>/);
      if (!nameMatch) continue;
      const name = decode(nameMatch[1]);
      if (!name) continue;
      const price = nameMatch[2] ? Number(nameMatch[2].replace(/,/g, "")) : null;
      const custom = row.match(/<p class="ep-tix-custom">([\s\S]*?)<\/p>/);
      const timeText = custom ? decode(custom[1]) : null;
      const ticketId = row.match(/name="TicketID\[\]" value="(\d+)"/)?.[1] ?? null;
      const maxMatch = row.match(/data-max="(\d+)"/);
      const flag = row.match(/<span class="ep-acc-soon"[^>]*>([\s\S]*?)<\/span>/);
      let status = "available";
      let statusLabel = "Available";
      let maxQty: number | null = null;
      if (maxMatch) {
        maxQty = Number(maxMatch[1]);
        if (maxQty <= 0) { status = "sold_out"; statusLabel = "Sold Out"; }
      } else if (flag) {
        statusLabel = decode(flag[1]) || "Unavailable";
        status = /sold\s*out|agotad/i.test(statusLabel) ? "sold_out" : statusLabel.toLowerCase().replace(/[^a-z]+/g, "_");
      } else {
        status = "unavailable"; statusLabel = "Unavailable";
      }
      out.push({
        watch_key: `${eid}|${name.toLowerCase()}`,
        ticket_id: ticketId,
        event_date: eventDate,
        name,
        price,
        time_text: timeText,
        status,
        status_label: statusLabel,
        max_qty: maxQty,
      });
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const force = new URL(req.url).searchParams.get("force") === "1";

  // Throttle: the function URL is reachable with the public key, so ignore
  // repeat calls inside the window (the daily schedule is the real trigger).
  if (!force) {
    const { data: last } = await supabase
      .from("ticket_watch_runs").select("ran_at").eq("ok", true)
      .order("ran_at", { ascending: false }).limit(1).maybeSingle();
    if (last && Date.now() - new Date(last.ran_at).getTime() < MIN_MINUTES_BETWEEN_RUNS * 60_000) {
      return Response.json({ skipped: true, last: last.ran_at });
    }
  }

  const ranAt = new Date().toISOString();
  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`MiEvento returned HTTP ${res.status}`);
    const tickets = parsePage(await res.text());
    if (tickets.length === 0) throw new Error("No tickets found — page layout may have changed");

    const { data: prevRows } = await supabase.from("ticket_watch").select("watch_key, status, max_qty, sold_out_since, first_seen");
    const prev = new Map((prevRows ?? []).map((r) => [r.watch_key, r]));

    const rows = tickets.map((t) => {
      const p = prev.get(t.watch_key);
      return {
        ...t,
        prev_status: p?.status ?? null,
        prev_max_qty: p?.max_qty ?? null,
        first_seen: p?.first_seen ?? ranAt,
        sold_out_since: t.status === "sold_out" ? (p?.status === "sold_out" ? p.sold_out_since ?? ranAt : ranAt) : null,
        last_seen: ranAt,
        updated_at: ranAt,
      };
    });
    const { error: upErr } = await supabase.from("ticket_watch").upsert(rows, { onConflict: "watch_key" });
    if (upErr) throw new Error(upErr.message);

    const soldOut = rows.filter((r) => r.status === "sold_out").length;
    await supabase.from("ticket_watch_runs").insert({ ran_at: ranAt, ok: true, tickets: rows.length, sold_out: soldOut });
    return Response.json({ ok: true, tickets: rows.length, sold_out: soldOut });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("ticket_watch_runs").insert({ ran_at: ranAt, ok: false, error: message.slice(0, 500) });
    return Response.json({ ok: false, error: message }, { status: 502 });
  }
});
