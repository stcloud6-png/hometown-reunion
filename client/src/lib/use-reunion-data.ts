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
  "id,name,arrival,departure,slots,interests,updated_at,attending,volunteer_support,volunteer_lead,yacht_paid,mievento_intents,mievento_ticket_status,is_test";
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
        setIsDemo(true);
        const stubMine = session ? DEMO_PEOPLE.find((p) => (p.email ?? "").toLowerCase() === session.email.toLowerCase()) ?? null : null;
        setMyEntry(stubMine);
        const stubTest = Boolean(session && /tester@/i.test(session.email));
        setIsAdmin(Boolean(session) && !stubTest);
        setIsTestAccount(stubTest);
        setLedActivityIds(session ? ["napoli"] : []);
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

  return {
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
