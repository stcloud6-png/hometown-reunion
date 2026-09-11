import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { STORAGE_KEYS, parseAuthHashFragment, storage, supabaseAuth } from "@/lib/reunion";

// Supabase's magic-link redirect lands on this site as
// `#access_token=...&refresh_token=...&...` (or, in this app's flow, as a
// `?token_hash=...` query string appended to the hash route). Either form
// must be resolved into a stored session BEFORE wouter's hash router reads
// `location.hash` as a path — otherwise it 404s on what looks like a bogus
// route instead of signing the visitor in.
async function resolveAuthRedirect() {
  const hash = window.location.hash;

  // Form 1: raw access_token/refresh_token straight in the fragment.
  if (hash.includes("access_token=")) {
    const { accessToken, refreshToken, email } = parseAuthHashFragment(hash);
    if (accessToken && refreshToken) {
      storage.set(STORAGE_KEYS.accessToken, accessToken);
      storage.set(STORAGE_KEYS.refreshToken, refreshToken);
      if (email) storage.set(STORAGE_KEYS.email, email);
    }
    window.location.hash = "#/";
    return;
  }

  // Form 2: a token_hash query param tacked onto the route, e.g. #/?token_hash=...
  const query = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : "";
  const tokenHash = new URLSearchParams(query).get("token_hash");
  if (tokenHash) {
    try {
      const result = await supabaseAuth.verifyMagicLink(tokenHash);
      const user = await supabaseAuth.getUser(result.access_token);
      storage.set(STORAGE_KEYS.accessToken, result.access_token);
      storage.set(STORAGE_KEYS.refreshToken, result.refresh_token);
      if (user.email) storage.set(STORAGE_KEYS.email, user.email);
    } catch {
      // Leave the error to be surfaced by the page itself (linkError state).
    }
    window.location.hash = "#/";
  }
}

async function boot() {
  await resolveAuthRedirect();
  if (!window.location.hash) {
    window.location.hash = "#/";
  }
  createRoot(document.getElementById("root")!).render(<App />);
}

boot();
