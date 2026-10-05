// Ticket watch — reads the public MiEvento CZR2027 page once a day and stores a
// snapshot of each ticket's status (available / sold out / other) and the
// purchase limit MiEvento exposes. Read-only toward MiEvento; writes only the
// ticket_watch tables. Triggered by pg_cron (see migration 20261004_ticket_watch.sql).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SOURCE_URL = "https://www.mieventos.com/event-multiple-detail/czr-2027";
const MIN_MINUTES_BETWEEN_RUNS = 30;
// Structure markers the reader depends on. If any disappear, the reader needs updating.
const REQUIRED_MARKERS = ["ep-acc", "ep-acc-row", "ep-acc-tname", "ep-date-day", "ep-tix-custom", "data-eid", "data-max"];
// Markers that come and go with normal ticket state (not a layout change).
const VOLATILE_MARKERS = new Set(["ep-acc-soon"]);

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

/** Sorted set of MiEvento widget class names + data attributes — the page "skeleton", no text. */
export function layoutTokens(html: string): string[] {
  const set = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) for (const t of m[1].split(/\s+/)) if (t.startsWith("ep-")) set.add(t);
  // data-* attributes only from the ticket widget's own tags / ticket inputs (ignores analytics, ads, site chrome).
  for (const tag of html.matchAll(/<[a-z]+\s[^>]*>/gi)) {
    const t = tag[0];
    if (!/class="[^"]*\bep-/.test(t) && !/name="TicketID\[\]"/.test(t) && !/\sdata-max=/.test(t)) continue;
    for (const m of t.matchAll(/\s(data-[a-z-]+)=/g)) set.add(m[1]);
  }
  for (const m of html.matchAll(/name="(TicketID\[\])"/g)) set.add(m[1]);
  return [...set].sort();
}

const MONTHS: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
  // Spanish (MiEvento serves Spanish when it ignores the language header)
  enero: "01", febrero: "02", marzo: "03", abril: "04", mayo: "05", junio: "06",
  julio: "07", agosto: "08", septiembre: "09", setiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

function decode(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&minus;/g, "-")
    .replace(/\s+/g, " ").trim();
}

function toIsoDate(text: string): string | null {
  const en = text.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);          // January 17, 2027
  const es = text.match(/(\d{1,2})\s+de\s+([A-Za-z]+)\s+(?:de\s+)?(\d{4})/i); // 17 de enero de 2027
  const [month, day, year] = en ? [en[1], en[2], en[3]] : es ? [es[2], es[1], es[3]] : [];
  const mm = month ? MONTHS[month.toLowerCase()] : undefined;
  return mm ? `${year}-${mm}-${day.padStart(2, "0")}` : null;
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
  const { data: prevGood } = await supabase
    .from("ticket_watch_runs").select("tickets, dates, layout_hash, layout_tokens").eq("ok", true)
    .order("ran_at", { ascending: false }).limit(1).maybeSingle();
  const diag: Record<string, unknown> = {};
  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    diag.http_status = res.status;
    if (!res.ok) throw new Error(`MiEvento returned HTTP ${res.status}`);
    const html = await res.text();
    diag.page_bytes = html.length;

    // Layout fingerprint + sanity totals, compared with the last good day.
    const tokens = layoutTokens(html);
    const stable = tokens.filter((t) => !VOLATILE_MARKERS.has(t));
    diag.layout_tokens = stable;
    diag.layout_hash = await sha256(stable.join(","));
    const tickets = parsePage(html);
    const dates = new Set(tickets.map((t) => t.event_date)).size;
    const priced = tickets.filter((t) => t.price != null).length;
    const timed = tickets.filter((t) => t.time_text).length;
    Object.assign(diag, { tickets: tickets.length, dates, priced, timed });
    diag.content_hash = await sha256(JSON.stringify(
      [...tickets].sort((a, b) => a.watch_key.localeCompare(b.watch_key)).map((t) => [t.watch_key, t.status, t.max_qty, t.price, t.time_text]),
    ));

    const warnings: string[] = [];
    const missing = REQUIRED_MARKERS.filter((m) => !tokens.includes(m));
    if (missing.length) warnings.push(`Page markers missing: ${missing.join(", ")}`);
    diag.layout_changed = !!prevGood?.layout_hash && prevGood.layout_hash !== diag.layout_hash;
    if (diag.layout_changed) {
      const before = new Set<string>(prevGood?.layout_tokens ?? []);
      const added = stable.filter((t) => !before.has(t));
      const removed = [...before].filter((t) => !stable.includes(t));
      warnings.push(`Page layout changed${added.length ? ` · added ${added.slice(0, 8).join(", ")}` : ""}${removed.length ? ` · removed ${removed.slice(0, 8).join(", ")}` : ""}`);
    }
    if (prevGood?.dates && dates < prevGood.dates) warnings.push(`Dates dropped from ${prevGood.dates} to ${dates}`);
    if (prevGood?.tickets && tickets.length < prevGood.tickets * 0.7) warnings.push(`Tickets dropped from ${prevGood.tickets} to ${tickets.length}`);
    if (tickets.length && priced / tickets.length < 0.9) warnings.push(`Only ${priced} of ${tickets.length} tickets show a price`);
    if (tickets.length && timed / tickets.length < 0.9) warnings.push(`Only ${timed} of ${tickets.length} tickets show a time`);
    diag.warnings = warnings;

    // Action needed: nothing readable, or less than half of last good day — keep the last good snapshot.
    if (tickets.length === 0) throw new Error("No tickets found — page layout may have changed");
    if (prevGood?.tickets && tickets.length < prevGood.tickets * 0.5) {
      throw new Error(`Only ${tickets.length} tickets read (last good day had ${prevGood.tickets}) — snapshot not updated`);
    }

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
    const health = warnings.length ? "warning" : "ok";
    await supabase.from("ticket_watch_runs").insert({ ran_at: ranAt, ok: true, sold_out: soldOut, health, ...diag });
    return Response.json({ ok: true, health, tickets: rows.length, sold_out: soldOut, dates, warnings });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("ticket_watch_runs").insert({ ran_at: ranAt, ok: false, health: "action", error: message.slice(0, 500), ...diag });
    return Response.json({ ok: false, health: "action", error: message, warnings: diag.warnings ?? [] }, { status: 502 });
  }
});
