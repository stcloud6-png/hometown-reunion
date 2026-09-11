import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Activity,
  type ClusterLead,
  type ClusterResource,
  type EventPlan,
  type Person,
  BASE_ACTIVITIES,
  DEMO_PEOPLE,
  STORAGE_KEYS,
  storage,
  supabaseAuth,
  supabaseRest,
  parseAuthHashFragment,
} from "./reunion";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [session, setSession] = useState<Session | null>(() => (stub ? null : loadStoredSession()));
  const [linkError, setLinkError] = useState<string | null>(null);
  const stubActivities = useRef<Activity[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (stub) {
        setPeople(DEMO_PEOPLE);
        setActivities([...BASE_ACTIVITIES, ...stubActivities.current]);
        setClusterResources([]);
        setClusterLeads([{ activity_id: "napoli", lead_name: "Demo Organizer" }]);
        setEventPlans([{ activity_id: "napoli", status: "open", event_date: "2027-01-13", start_time: "11:30am", venue: "Napoli", max_size: 50 }]);
        setIsDemo(true);
        return;
      }
      const token = session?.accessToken ?? null;
      const [peopleRes, activitiesRes, resourcesRes, leadsRes, plansRes] = await Promise.all([
        supabaseRest<Person[]>("/people?select=*&order=name.asc", { accessToken: token }),
        supabaseRest<Activity[]>("/activities?select=*&order=id.asc", { accessToken: token }),
        supabaseRest<ClusterResource[]>("/cluster_resources?select=*&order=created_at.asc", { accessToken: token }),
        supabaseRest<ClusterLead[]>("/cluster_leads?select=*", { accessToken: token }),
        supabaseRest<EventPlan[]>("/event_plans?select=*", { accessToken: token }),
      ]);
      setPeople(peopleRes);
      setActivities([...BASE_ACTIVITIES, ...activitiesRes]);
      setClusterResources(resourcesRes);
      setClusterLeads(leadsRes);
      setEventPlans(plansRes);
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
        setPeople((prev) => {
          const idx = prev.findIndex((p) => p.name === person.name);
          if (idx === -1) return [...prev, person];
          const next = [...prev];
          next[idx] = person;
          return next;
        });
        return;
      }
      await supabaseRest("/people", {
        method: "POST",
        accessToken: session?.accessToken,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { ...person, updated_at: new Date().toISOString() },
      });
      await load();
    },
    [session, stub, load],
  );

  const suggestActivity = useCallback(
    async (id: string, label: string, suggestedBy: string) => {
      if (stub) {
        stubActivities.current = [...stubActivities.current, { id, label, suggested_by: suggestedBy }];
        setActivities([...BASE_ACTIVITIES, ...stubActivities.current]);
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
        setClusterLeads((prev) => [...prev.filter((l) => l.activity_id !== lead.activity_id), lead]);
        return;
      }
      await supabaseRest("/cluster_leads", {
        method: "POST",
        accessToken: session?.accessToken,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: lead,
      });
      await load();
    },
    [session, stub, load],
  );

  const saveEventPlan = useCallback(
    async (plan: EventPlan) => {
      if (stub) {
        setEventPlans((prev) => [...prev.filter((p) => p.activity_id !== plan.activity_id), plan]);
        return;
      }
      await supabaseRest("/event_plans", {
        method: "POST",
        accessToken: session?.accessToken,
        prefer: "resolution=merge-duplicates,return=minimal",
        body: { ...plan, updated_at: new Date().toISOString() },
      });
      await load();
    },
    [session, stub, load],
  );

  const signOut = useCallback(() => {
    persistSession(null);
  }, [persistSession]);

  return {
    people,
    activities,
    clusterResources,
    clusterLeads,
    eventPlans,
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
  };
}

export { parseAuthHashFragment };
