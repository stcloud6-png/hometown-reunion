import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_TICKETS, latestTickets, type TicketWatchRow, type TicketWatchRun } from "@/lib/ticket-watch";
import {
  type Activity,
  type ClusterLead,
  type ClusterResource,
  type ClusterThresholds,
  type EventPlan,
  type Person,
  BASE_ACTIVITIES,
  CLUSTER_THRESHOLDS,
  mergeActivities,
  DEMO_PEOPLE,
  STORAGE_KEYS,
  storage,
  supabaseAuth,
  supabaseRest,
  supabaseRpc,
  parseAuthHashFragment,
} from "./reunion";

/** Public columns only — member emails are never readable by the public API. */
const PEOPLE_COLUMNS =
  "id,name,arrival,departure,slots,interests,updated_at,attending,volunteer_support,volunteer_lead,yacht_paid,mievento_intents,mievento_ticket_status,yacht_status,event_answers,pill_slots,is_test";
/** A class roster name (pre-created account). Emails are never readable by the public. */
export interface RosterEntry {
  id: string;
  display_name: string;
  search_names: string[];
  status: "unclaimed" | "claimed" | "pending_review";
  person_id: string | null;
}

/** The signed-in person's own roster row, incl. a suggested yearbook photo to confirm. */
export interface MyRoster {
  id: string;
  display_name: string;
  status: RosterEntry["status"];
  yearbook_name: string | null;
  yearbook_confirmed: boolean;
  page: number | null;
  box: number[] | null;
}

/** One portrait overlay in the yearbook (public): position, watermark, border categories. */
export interface YearbookOverlay {
  page: number;
  box: [number, number, number, number];
  watermark: string | null;
  honor: boolean;
  categories: string[];
}

const PENDING_CLAIM_KEY = "czr-pending-claim";
export interface PendingClaim { rosterId: string | null; name: string }
export function readPendingClaim(): PendingClaim | null {
  try { return JSON.parse(localStorage.getItem(PENDING_CLAIM_KEY) ?? "null"); } catch { return null; }
}
export function writePendingClaim(c: PendingClaim | null) {
  try { if (c) localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify(c)); else localStorage.removeItem(PENDING_CLAIM_KEY); } catch { /* storage blocked */ }
}

const LEAD_COLUMNS = "id,activity_id,lead_name,chat_link,created_at";

/** Member directory row — returned only to verified admins. */
export interface MemberDirectoryRow {
  id: string;
  name: string;
  email: string | null;
  attending: boolean | null;
  is_test: boolean;
  /** Admin-hidden (fake/duplicate) entry — excluded from all group results. */
  hidden: boolean;
  updated_at: string | null;
}

/** Row shape of the shared `app_settings` table — one global row, id "default". */
interface AppSettingsRow {
  id: string;
  public_top: number;
  public_min_interest: number;
  candidate_at: number;
  spinoff_at: number;
}

function rowToThresholds(row: AppSettingsRow): ClusterThresholds {
  return {
    publicTop: row.public_top,
    publicMinInterest: row.public_min_interest,
    candidateAt: row.candidate_at,
    spinoffAt: row.spinoff_at,
  };
}

interface Session {
  accessToken: string;
  refreshToken: string;
  email: string;
}

function loadStoredSession(): Session | null {
  const accessToken = storage.get<string>(STORAGE_KEYS.accessToken);
  const refreshToken = storage.get<string>(STORAGE_KEYS.refreshToken);
  const email = storage.get<string>(STORAGE_KEYS.email);
  if (accessToken && refreshToken && email) return { accessToken, refreshToken, email };
  return null;
}

/**
 * Central data hook for the reunion app. Talks directly to Supabase's REST API
 * (protected by Row Level Security) — no custom backend. Mirrors the shape of
 * the live site's own data hook: people / activities / clusterResources /
 * clusterLeads / eventPlans / loading / error / isDemo, plus the mutation and
 * auth actions every screen needs.
 *
 * `stub` swaps every network call for the in-memory demo dataset — used during
 * local QA so nothing is ever written to the live Supabase project.
 */
export function useReunionData(options: { stub?: boolean } = {}) {
  const { stub = false } = options;
  const [people, setPeople] = useState<Person[]>([]);
  const [activities, setActivities] = useState<Activity[]>(BASE_ACTIVITIES);
  const [clusterResources, setClusterResources] = useState<ClusterResource[]>([]);
  const [clusterLeads, setClusterLeads] = useState<ClusterLead[]>([]);
  const [eventPlans, setEventPlans] = useState<EventPlan[]>([]);
  const [tickets, setTickets] = useState<TicketWatchRow[]>([]);
  const [ticketRun, setTicketRun] = useState<TicketWatchRun | null>(null);
  const [ticketHealth, setTicketHealth] = useState<TicketWatchRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [appSettings, setAppSettings] = useState<ClusterThresholds>(CLUSTER_THRESHOLDS);
  const [session, setSession] = useState<Session | null>(() => (stub ? null : loadStoredSession()));
  const [linkError, setLinkError] = useState<string | null>(null);
  const [myEntry, setMyEntry] = useState<Person | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTestAccount, setIsTestAccount] = useState(false);
  const [ledActivityIds, setLedActivityIds] = useState<string[]>([]);
  const stubActivities = useRef<Activity[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [myRoster, setMyRoster] = useState<MyRoster | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (stub) {
        setPeople(DEMO_PEOPLE);
        setActivities(mergeActivities(stubActivities.current));
        setClusterResources([]);
        setClusterLeads([{ activity_id: "napoli", lead_name: "Demo Organizer" }]);
        setEventPlans([{ activity_id: "napoli", status: "open", event_date: "2027-01-20", start_time: "11:30am", venue: "Napoli", max_size: 50 }]);
        setTickets(DEMO_TICKETS);
        setTicketRun({ ran_at: DEMO_TICKETS[0].last_seen, ok: true, tickets: DEMO_TICKETS.length, sold_out: 3 });
        // Stub-only QA hook: localStorage "czr-stub-ticket-health" = ok | warning | action | stale
        const stubHealth = typeof localStorage !== "undefined" ? localStorage.getItem("czr-stub-ticket-health") : null;
        const stubAt = stubHealth === "stale" ? new Date(Date.now() - 50 * 3_600_000).toISOString() : DEMO_TICKETS[0].last_seen;
        if (stubHealth === "stale") setTicketRun({ ran_at: stubAt, ok: true, tickets: DEMO_TICKETS.length, sold_out: 3 });
        setTicketHealth({
          ran_at: stubHealth === "action" ? new Date().toISOString() : stubAt,
          ok: stubHealth !== "action", tickets: DEMO_TICKETS.length, sold_out: 3, dates: 8,
          health: stubHealth === "warning" ? "warning" : stubHealth === "action" ? "action" : "ok",
          warnings: stubHealth === "warning" ? ["Page layout changed · added ep-new-row · removed ep-acc-row"] : stubHealth === "action" ? ["No tickets found — page layout may have changed"] : [],
          layout_changed: stubHealth === "warning",
        });
        setRoster(DEMO_ROSTER);
        setIsDemo(true);
        const stubMine = session ? DEMO_PEOPLE.find((p) => (p.email ?? "").toLowerCase() === session.email.toLowerCase()) ?? null : null;
        setMyEntry(stubMine);
        const stubTest = Boolean(session && /tester@/i.test(session.email));
        setIsAdmin(Boolean(session) && !stubTest);
        setIsTestAccount(stubTest);
        setLedActivityIds(session ? ["napoli"] : []);
        setMyRoster(session ? stubMyRoster(session.email, readPendingClaim()) : null);
        return;
      }
      const token = session?.accessToken ?? null;
      // Caller-specific facts (own entry, admin/organizer status). These are
      // answered by the database from the verified sign-in, never from what
      // the browser claims. Failures degrade to "not signed in" rights.
      const mine = token
        ? Promise.all([
            supabaseRpc<Person[]>("my_entry", {}, token).catch(() => [] as Person[]),
            supabaseRpc<boolean>("app_is_admin", {}, token).catch(() => false),
            supabaseRpc<boolean>("app_is_test_account", {}, token).catch(() => false),
            supabaseRpc<string[]>("my_led_activities", {}, token).catch(() => [] as string[]),
          ])
        : Promise.resolve([[] as Person[], false, false, [] as string[]] as const);
      const [peopleRes, activitiesRes, resourcesRes, leadsRes, plansRes, settingsRes, mineRes] = await Promise.all([
        supabaseRest<Person[]>(`/people?select=${PEOPLE_COLUMNS}&order=name.asc`, { accessToken: token }).catch(() =>
          // Before the is_test column exists (mid-rollout), read without it.
          supabaseRest<Person[]>(`/people?select=${PEOPLE_COLUMNS.replace(/,?is_test/, "")}&order=name.asc`, { accessToken: token }),
        ),
        supabaseRest<Activity[]>("/activities?select=*&order=id.asc", { accessToken: token }),
        supabaseRest<ClusterResource[]>("/cluster_resources?select=*&order=created_at.asc", { accessToken: token }),
        supabaseRest<ClusterLead[]>(`/cluster_leads?select=${LEAD_COLUMNS}`, { accessToken: token }),
        supabaseRest<EventPlan[]>("/event_plans?select=*", { accessToken: token }),
        supabaseRest<AppSettingsRow[]>("/app_settings?select=*&id=eq.default", { accessToken: token }).catch(() => []),
        mine,
      ]);
      // Ticket watch is optional extra info — never let it block the page.
      void Promise.all([
        supabaseRest<TicketWatchRow[]>("/ticket_watch?select=*&order=event_date.asc", { accessToken: token }),
        supabaseRest<TicketWatchRun[]>("/ticket_watch_runs?select=ran_at,ok,tickets,sold_out&ok=eq.true&order=ran_at.desc&limit=1", { accessToken: token }),
        // Latest run of any outcome (for the Maintenance health line).
        supabaseRest<TicketWatchRun[]>("/ticket_watch_runs?select=ran_at,ok,tickets,sold_out,health,warnings,dates,layout_changed&order=ran_at.desc&limit=1", { accessToken: token }).catch(() => []),
      ])
        .then(([rows, runs, latest]) => {
          setTickets(latestTickets(rows));
          setTicketRun(runs[0] ?? null);
          setTicketHealth(latest[0] ?? null);
        })
        .catch(() => undefined);
      // Roster names (for the "find your name" picker) and the caller's own roster row.
      void supabaseRest<RosterEntry[]>("/roster?select=id,display_name,search_names,status,person_id&order=display_name.asc", { accessToken: token })
        .then(setRoster).catch(() => setRoster([]));
      if (token) {
        void supabaseRpc<MyRoster[]>("my_roster", {}, token)
          .then((rows) => setMyRoster(Array.isArray(rows) && rows[0] ? rows[0] : null))
          .catch(() => setMyRoster(null));
      } else setMyRoster(null);
      const [myRows, admin, tester, led] = mineRes;
      setMyEntry(Array.isArray(myRows) && myRows[0] ? myRows[0] : null);
      setIsAdmin(admin === true);
      setIsTestAccount(tester === true);
      setLedActivityIds(Array.isArray(led) ? led.map((v) => (typeof v === "string" ? v : String((v as Record<string, unknown>).my_led_activities ?? ""))).filter(Boolean) : []);
      setPeople(peopleRes);
      setActivities(mergeActivities(activitiesRes));
      setClusterResources(resourcesRes);
      setClusterLeads(leadsRes);
      setEventPlans(plansRes);
      if (settingsRes[0]) setAppSettings(rowToThresholds(settingsRes[0]));
      setIsDemo(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reunion data.");
      // Fall back to demo data so the page still renders something useful.
      setPeople(DEMO_PEOPLE);
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, [session, stub]);

  useEffect(() => {
    load();
  }, [load]);

  // Pick up access_token/refresh_token left in the URL hash by a magic-link
  // redirect (parsed once in main.tsx, re-checked here in case this hook
  // mounts before that runs) and exchange a token_hash query param for a
  // session if present.
  useEffect(() => {
    if (stub) return;
    const stored = loadStoredSession();
    if (stored && !session) setSession(stored);
  }, [stub, session]);

  // Keep React state in step with background token refreshes / expiry.
  useEffect(() => {
    if (stub) return;
    const onRefreshed = () => {
      const stored = loadStoredSession();
      if (stored) setSession((prev) => (prev && prev.accessToken === stored.accessToken ? prev : stored));
    };
    const onExpired = () => setSession(null);
    window.addEventListener("reunion-session-refreshed", onRefreshed);
    window.addEventListener("reunion-session-expired", onExpired);
    return () => {
      window.removeEventListener("reunion-session-refreshed", onRefreshed);
      window.removeEventListener("reunion-session-expired", onExpired);
    };
  }, [stub]);

  const persistSession = useCallback((next: Session | null) => {
    setSession(next);
    if (next) {
      storage.set(STORAGE_KEYS.accessToken, next.accessToken);
      storage.set(STORAGE_KEYS.refreshToken, next.refreshToken);
      storage.set(STORAGE_KEYS.email, next.email);
    } else {
      storage.del(STORAGE_KEYS.accessToken);
      storage.del(STORAGE_KEYS.refreshToken);
      storage.del(STORAGE_KEYS.email);
    }
  }, []);

  const completeMagicLink = useCallback(
    async (tokenHash: string) => {
      setLinkError(null);
      try {
        const result = await supabaseAuth.verifyMagicLink(tokenHash);
        const user = await supabaseAuth.getUser(result.access_token);
        if (!user.email) throw new Error("Sign-in link did not include an email.");
        persistSession({ accessToken: result.access_token, refreshToken: result.refresh_token, email: user.email });
        return user.email;
      } catch (e) {
        setLinkError(e instanceof Error ? e.message : "This sign-in link is invalid or has expired.");
        return null;
      }
    },
    [persistSession],
  );

  const savePerson = useCallback(
    async (person: Person) => {
      if (stub) {
        // Merge onto the existing row (matching production's PostgREST
        // merge-duplicates upsert, which only touches columns present in
        // the payload) so fields the form doesn't send — yacht_paid,
        // mievento_intents — survive a re-save during local/stub QA.
        setPeople((prev) => {
          const idx = prev.findIndex((p) => p.name === person.name);
          if (idx === -1) return [...prev, person];
          const next = [...prev];
          next[idx] = { ...next[idx], ...person };
          return next;
        });
        return;
      }
      const body = { ...person, updated_at: new Date().toISOString() } as Record<string, unknown>;
      delete body.id;
      delete body.is_test;
      if (myEntry?.id && session?.accessToken) {
        // Signed-in member changing their own entry: update that one row. The
        // database only allows it when the verified sign-in email matches.
        const saved = await supabaseRest<{ id: string }[]>(`/people?id=eq.${encodeURIComponent(myEntry.id)}&select=id`, {
          method: "PATCH",
          accessToken: session.accessToken,
          prefer: "return=representation",
          body,
        });
        if (!saved || saved.length !== 1) throw new Error("permission denied");
      } else {
        // Brand-new entry. An existing name is refused by the database
        // (unique name), so nobody can overwrite someone else's entry.
        await supabaseRest("/people", {
          method: "POST",
          accessToken: session?.accessToken,
          prefer: "return=minimal",
          body,
        });
      }
      await load();
    },
    [session, stub, load, myEntry],
  );

  const suggestActivity = useCallback(
    async (id: string, label: string, suggestedBy: string) => {
      if (stub) {
        stubActivities.current = [...stubActivities.current, { id, label, suggested_by: suggestedBy }];
        setActivities(mergeActivities(stubActivities.current));
        return;
      }
      await supabaseRest("/activities", {
        method: "POST",
        accessToken: session?.accessToken,
        prefer: "return=minimal",
        body: { id, label, suggested_by: suggestedBy },
      });
      await load();
    },
    [session, stub, load],
  );

  const suggestResource = useCallback(
    async (resource: ClusterResource) => {
      if (stub) {
        setClusterResources((prev) => [...prev, resource]);
        return;
      }
      await supabaseRest("/cluster_resources", {
        method: "POST",
        accessToken: session?.accessToken,
        prefer: "return=minimal",
        body: resource,
      });
      await load();
    },
    [session, stub, load],
  );

  const volunteerLead = useCallback(
    async (lead: ClusterLead) => {
      if (stub) {
        setClusterLeads((prev) => {
          const existing = prev.find((l) => l.activity_id === lead.activity_id);
          const merged = { ...existing, ...lead };
          return [...prev.filter((l) => l.activity_id !== lead.activity_id), merged];
        });
        return;
      }
      await supabaseRpc(
        "volunteer_as_lead",
        { p_activity_id: lead.activity_id, p_lead_name: lead.lead_name ?? "", p_lead_email: lead.lead_email ?? "" },
        session?.accessToken,
      );
      await load();
    },
    [session, stub, load],
  );

  /**
   * Save an event's group chat link. Allowed for admins and for that event's
   * signed-in organizer; a denied change is reported instead of looking saved.
   */
  const saveChatLink = useCallback(
    async (activityId: string, chatLink: string | null) => {
      if (stub) {
        setClusterLeads((prev) => {
          const existing = prev.find((l) => l.activity_id === activityId);
          return [...prev.filter((l) => l.activity_id !== activityId), { ...existing, activity_id: activityId, chat_link: chatLink }];
        });
        return;
      }
      if (!session?.accessToken) throw new Error("permission denied");
      const existing = clusterLeads.find((l) => l.activity_id === activityId);
      if (existing) {
        const saved = await supabaseRest<{ id: number }[]>(`/cluster_leads?activity_id=eq.${encodeURIComponent(activityId)}&select=id`, {
          method: "PATCH",
          accessToken: session.accessToken,
          prefer: "return=representation",
          body: { chat_link: chatLink },
        });
        if (!saved || saved.length !== 1) throw new Error("permission denied");
      } else {
        await supabaseRest("/cluster_leads", {
          method: "POST",
          accessToken: session.accessToken,
          prefer: "return=minimal",
          body: { activity_id: activityId, chat_link: chatLink },
        });
      }
      await load();
    },
    [session, stub, load, clusterLeads],
  );

  /** Admin-only: full member list with emails (the database refuses anyone else). */
  const fetchMemberDirectory = useCallback(async (): Promise<MemberDirectoryRow[]> => {
    if (stub) {
      return DEMO_PEOPLE.map((p, i) => ({
        id: p.id ?? `demo-${i}`,
        name: p.name,
        email: p.email ?? null,
        attending: p.attending ?? null,
        is_test: false,
        hidden: false,
        updated_at: p.updated_at ?? null,
      }));
    }
    if (!session?.accessToken) throw new Error("Admin sign-in required.");
    return supabaseRpc<MemberDirectoryRow[]>("admin_member_directory", {}, session.accessToken);
  }, [session, stub]);

  /** Admin-only: hide (or restore) an entry from every group result. Never deletes data. */
  const setMemberHidden = useCallback(
    async (id: string, hidden: boolean) => {
      if (stub) return;
      if (!session?.accessToken) throw new Error("Admin sign-in required.");
      await supabaseRpc("admin_set_member_hidden", { p_id: id, p_hidden: hidden }, session.accessToken);
      await load();
    },
    [session, stub, load],
  );

  /** Password sign-in for the private test account only. */
  const signInTestAccount = useCallback(
    async (email: string, password: string) => {
      if (stub) {
        persistSession({ accessToken: "stub-token", refreshToken: "stub-refresh", email });
        return;
      }
      const result = await supabaseAuth.signInWithPassword(email.trim(), password);
      const user = result.user?.email ? result.user : await supabaseAuth.getUser(result.access_token);
      if (!user.email) throw new Error("Sign-in failed.");
      persistSession({ accessToken: result.access_token, refreshToken: result.refresh_token, email: user.email });
    },
    [stub, persistSession],
  );

  /** True when a (non-test) reunion entry already uses this email. Reveals nothing else. */
  const entryEmailTaken = useCallback(
    async (email: string): Promise<boolean> => {
      if (stub) return DEMO_PEOPLE.some((p) => (p.email ?? "").toLowerCase() === email.trim().toLowerCase());
      try {
        return (await supabaseRpc<boolean>("entry_email_taken", { p_email: email.trim() })) === true;
      } catch {
        return false;
      }
    },
    [stub],
  );

  const saveEventPlan = useCallback(
    async (plan: EventPlan) => {
      if (stub) {
        setEventPlans((prev) => [...prev.filter((p) => p.activity_id !== plan.activity_id), plan]);
        return;
      }
      // This editor changes an existing plan, never inserts a replacement.
      // activity_id is unique; a missing/denied row must not look like success.
      const saved = await supabaseRest<EventPlan[]>(`/event_plans?activity_id=eq.${encodeURIComponent(plan.activity_id)}`, {
        method: "PATCH",
        accessToken: session?.accessToken,
        prefer: "return=representation",
        body: {
          status: plan.status,
          event_date: plan.event_date,
          start_time: plan.start_time,
          venue: plan.venue,
          max_size: plan.max_size,
          // The database stamps "updated by" itself (Maintenance / organizer
          // name) so no email address is ever published.
          updated_at: new Date().toISOString(),
        },
      });
      if (saved.length !== 1 || saved[0].activity_id !== plan.activity_id) {
        throw new Error("No plan was updated. Refresh the dashboard and try again.");
      }
      setEventPlans((prev) => prev.map((p) => p.activity_id === plan.activity_id ? saved[0] : p));
    },
    [session, stub],
  );

  /**
   * Update the shared Maintenance-mode cluster thresholds. Applies immediately
   * for every visitor since it's read from the shared `app_settings` table,
   * not per-browser localStorage. No auth required (matches the other
   * anon+authenticated open-write tables such as event_plans/cluster_leads).
   */
  const updateAppSettings = useCallback(
    async (next: ClusterThresholds) => {
      if (stub) {
        setAppSettings(next);
        return;
      }
      await supabaseRest("/app_settings", {
        method: "POST",
        accessToken: session?.accessToken,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          id: "default",
          public_top: next.publicTop,
          public_min_interest: next.publicMinInterest,
          candidate_at: next.candidateAt,
          spinoff_at: next.spinoffAt,
          updated_at: new Date().toISOString(),
        },
      });
      setAppSettings(next);
    },
    [session, stub],
  );

  const signOut = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  /**
   * Find the caller's own row by case-insensitive email match against the
   * currently signed-in session — the only row RLS will let them update.
   * Returns null when stubbed-out with no session, or no match on file.
   */
  const myPerson = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (_email?: string | null): Person | null => (session ? myEntry : null),
    [session, myEntry],
  );

  /**
   * Partial update to the signed-in user's own row (yacht_paid,
   * mievento_intents, etc). Requires an authenticated session whose email
   * matches the target row — enforced both here (myPerson lookup) and by
   * Supabase RLS server-side. Sends only the changed columns so unrelated
   * fields (slots, interests, ...) are left untouched by the upsert.
   */
  const updateMyPerson = useCallback(
    async (patch: Partial<Person>) => {
      if (!session?.accessToken) throw new Error("Sign in with your email first.");
      const mine = myPerson(session.email);
      if (!mine) throw new Error("No reunion entry found for your email yet. Fill out your availability first.");
      if (stub) {
        setPeople((prev) => prev.map((p) => (p.name === mine.name ? { ...p, ...patch } : p)));
        setMyEntry({ ...mine, ...patch });
        return;
      }
      const saved = await supabaseRest<{ id: string }[]>(`/people?id=eq.${encodeURIComponent(mine.id ?? "")}&select=id`, {
        method: "PATCH",
        accessToken: session.accessToken,
        prefer: "return=representation",
        body: { ...patch, updated_at: new Date().toISOString() },
      });
      if (!saved || saved.length !== 1) throw new Error("permission denied");
      await load();
    },
    [session, stub, load, myPerson],
  );

  /** After a sign-in link: claim the picked roster name (or ask to be added). */
  const claimPending = useCallback(async () => {
    const pending = readPendingClaim();
    if (!pending || !session) return;
    setClaimError(null);
    try {
      if (stub) {
        setRoster((prev) => prev.map((r) => (r.id === pending.rosterId ? { ...r, status: "claimed" } : r)));
        setMyRoster(stubMyRoster(session.email, pending));
      } else if (pending.rosterId) {
        await supabaseRpc("claim_roster_name", { p_roster_id: pending.rosterId }, session.accessToken);
      } else {
        await supabaseRpc("request_roster_name", { p_name: pending.name }, session.accessToken);
      }
      writePendingClaim(null);
      if (!stub) await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/already claimed a name/.test(msg)) writePendingClaim(null);
      setClaimError(/already claimed a name/.test(msg)
        ? "This email is already linked to a name on the list."
        : /already claimed/.test(msg) ? "Someone has already claimed that name. If it's you, sign in with the email you used before, or contact the organizers."
        : "Couldn't link your name just now. Please try again.");
    }
  }, [session, stub, load]);

  useEffect(() => { if (session && readPendingClaim()) void claimPending(); }, [session, claimPending]);

  const confirmMyYearbook = useCallback(async (yes: boolean) => {
    if (!session) return;
    if (stub) { setMyRoster((r) => (r ? { ...r, yearbook_confirmed: yes, yearbook_name: yes ? r.yearbook_name : null } : r)); return; }
    await supabaseRpc("confirm_my_yearbook", { p_yes: yes }, session.accessToken);
    await load();
  }, [session, stub, load]);

  const fetchYearbookOverlays = useCallback(async (): Promise<YearbookOverlay[]> => {
    if (stub) return DEMO_OVERLAYS;
    return supabaseRpc<YearbookOverlay[]>("yearbook_overlays", {}, session?.accessToken ?? null);
  }, [stub, session]);

  return {
    roster,
    myRoster,
    claimError,
    claimPending,
    confirmMyYearbook,
    fetchYearbookOverlays,
    people,
    activities,
    clusterResources,
    clusterLeads,
    eventPlans,
    appSettings,
    updateAppSettings,
    loading,
    error,
    isDemo,
    savePerson,
    suggestActivity,
    suggestResource,
    volunteerLead,
    saveEventPlan,
    refresh: load,
    sessionEmail: session?.email ?? null,
    linkError,
    completeMagicLink,
    signOut,
    myPerson,
    updateMyPerson,
    isAdmin,
    isTestAccount,
    ledActivityIds,
    saveChatLink,
    fetchMemberDirectory,
    tickets,
    ticketRun,
    ticketHealth,
    setMemberHidden,
    signInTestAccount,
    entryEmailTaken,
    sendSignInLink: stub
      ? async (email: string) => {
          // Never hit the real Supabase Auth endpoint while showing stub/demo
          // data. Instead, simulate an instant sign-in so the rest of the
          // authenticated flow (yacht payment / MiEvento intents) is
          // exercisable during local QA without a real magic-link round trip.
          persistSession({ accessToken: "stub-token", refreshToken: "stub-refresh", email });
        }
      : supabaseAuth.sendMagicLink,
  };
}

export { parseAuthHashFragment };

// ---------------------------------------------------------------------------
// Stub data for offline QA (never written anywhere)
// ---------------------------------------------------------------------------
const DEMO_ROSTER: RosterEntry[] = [
  { id: "r-1", display_name: "Shelly Mickelson (McQuary)", search_names: ["Michelle McQuary"], status: "unclaimed", person_id: null },
  { id: "r-2", display_name: "Stacy Payton", search_names: [], status: "unclaimed", person_id: null },
  { id: "r-3", display_name: "Ted Melcher", search_names: ["Edward Melcher"], status: "unclaimed", person_id: null },
  { id: "r-4", display_name: "Bill King", search_names: ["William King"], status: "unclaimed", person_id: null },
  { id: "r-5", display_name: "Jerry Pankow", search_names: [], status: "claimed", person_id: null },
];

function stubMyRoster(email: string, pending?: PendingClaim | null): MyRoster | null {
  const picked = pending?.rosterId ? DEMO_ROSTER.find((r) => r.id === pending.rosterId) : null;
  if (/stacy/i.test(email) || picked?.id === "r-2") {
    return { id: "r-2", display_name: "Stacy Payton", status: "claimed", yearbook_name: "Stacy Collins", yearbook_confirmed: false, page: 13, box: [31.02, 10.57, 19.69, 21.21] };
  }
  if (picked) return { id: picked.id, display_name: picked.display_name, status: "claimed", yearbook_name: null, yearbook_confirmed: true, page: null, box: null };
  if (pending && !pending.rosterId) return { id: "r-new", display_name: pending.name, status: "pending_review", yearbook_name: null, yearbook_confirmed: false, page: null, box: null };
  return null;
}

const DEMO_OVERLAYS: YearbookOverlay[] = [
  { page: 14, box: [5.51, 10.41, 19.59, 21.45], watermark: "2026", honor: false, categories: [] },
  { page: 14, box: [26.73, 10.41, 19.59, 21.45], watermark: "2026 - Unconfirmed", honor: true, categories: ["Baseball"] },
  { page: 14, box: [69.29, 10.41, 19.59, 21.45], watermark: null, honor: false, categories: ["Basketball"] },
  { page: 14, box: [5.51, 36.04, 19.59, 21.45], watermark: "2026 - Unconfirmed", honor: true, categories: ["Basketball"] },
  { page: 14, box: [5.51, 61.44, 19.59, 21.45], watermark: "2026", honor: false, categories: ["Basketball", "Baseball"] },
  { page: 28, box: [68.57, 10.57, 19.29, 20.74], watermark: "2026", honor: true, categories: ["Baseball", "Basketball", "Football"] },
  { page: 14, box: [47.86, 10.41, 19.59, 21.45], watermark: null, honor: true, categories: ["Cheerleading"] },
  { page: 14, box: [26.73, 61.44, 19.59, 21.45], watermark: null, honor: false, categories: ["Football", "Track"] },
];
