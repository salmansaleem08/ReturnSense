/** Dashboard origin — update before publishing if different from production. */
const DASHBOARD_URL = "https://return-sense-web.vercel.app";

/**
 * Supabase password grant from the service worker (MV3).
 * Popups sometimes fail fetch() even with host_permissions; the worker is more reliable.
 */
function normalizeSupabaseUrl(url) {
  return String(url || "")
    .trim()
    .replace(/\/+$/, "");
}

function storageGet(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, resolve);
  });
}

function storageSet(obj) {
  return new Promise((resolve) => {
    chrome.storage.local.set(obj, resolve);
  });
}

/** Refresh access token using refresh_token — keeps extension logged in past JWT expiry. */
async function refreshSupabaseSession(supabaseUrl, anonKey, refreshToken) {
  const base = normalizeSupabaseUrl(supabaseUrl);
  const url = `${base}/auth/v1/token?grant_type=refresh_token`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey
    },
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
  if (!res.ok || !data.access_token) {
    console.warn("[RS] Supabase refresh failed:", res.status, data.error_description || data.msg || data.error);
    return null;
  }
  return data;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

  if (type === "RS_SUPABASE_PASSWORD_LOGIN") {
    const supabaseUrl = normalizeSupabaseUrl(message.supabaseUrl);
    const anonKey = message.anonKey;
    const email = message.email;
    const password = message.password;

    if (!supabaseUrl || !anonKey || !email || !password) {
      sendResponse({ ok: false, error: "Missing Supabase URL, anon key, email, or password." });
      return false;
    }

    let authUrl;
    try {
      const u = new URL(`${supabaseUrl}/auth/v1/token?grant_type=password`);
      if (u.protocol !== "https:") {
        throw new Error("SUPABASE_URL must use https://");
      }
      authUrl = u.toString();
    } catch (e) {
      sendResponse({
        ok: false,
        error:
          e instanceof Error
            ? e.message
            : "Invalid SUPABASE_URL (copy Project URL from Supabase → Settings → API)."
      });
      return false;
    }

    (async () => {
      try {
        const res = await fetch(authUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey
          },
          body: JSON.stringify({ email, password })
        });

        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          sendResponse({
            ok: false,
            status: res.status,
            error: `Non-JSON response (${res.status}). Check Supabase URL and project status.`,
            bodyPreview: text.slice(0, 200)
          });
          return;
        }

        if (!res.ok || data.error) {
          sendResponse({
            ok: false,
            status: res.status,
            data
          });
          return;
        }

        if (!data.access_token) {
          sendResponse({
            ok: false,
            status: res.status,
            data,
            error: "No access_token in response."
          });
          return;
        }

        sendResponse({ ok: true, data });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    })();

    return true;
  }

  if (type === "GET_TOKEN" || type === "RS_GET_SESSION") {
    (async () => {
      const data = await storageGet([
        "rs_session",
        "rs_user",
        "rs_auth_token",
        "rs_seller_email",
        "rs_supabase_url",
        "rs_supabase_anon_key",
        "rs_expires_at"
      ]);

      let session =
        data.rs_session || (data.rs_auth_token ? { access_token: data.rs_auth_token } : null);
      let token = session?.access_token ?? data.rs_auth_token ?? null;
      const refreshToken = session?.refresh_token;
      const supabaseUrl = data.rs_supabase_url;
      const anonKey = data.rs_supabase_anon_key;
      const exp = data.rs_expires_at;

      const needsRefresh =
        refreshToken &&
        supabaseUrl &&
        anonKey &&
        exp &&
        Date.now() > exp - 120000;

      if (needsRefresh) {
        const refreshed = await refreshSupabaseSession(supabaseUrl, anonKey, refreshToken);
        if (refreshed?.access_token) {
          session = refreshed;
          token = refreshed.access_token;
          const ttlSec = typeof refreshed.expires_in === "number" ? refreshed.expires_in : 3600;
          const nextExp = Date.now() + ttlSec * 1000 - 120000;
          await storageSet({
            rs_session: refreshed,
            rs_auth_token: refreshed.access_token,
            rs_expires_at: nextExp
          });
          console.log("[RS] Supabase session refreshed; next refresh before", new Date(nextExp).toISOString());
        }
      }

      sendResponse({
        session,
        user: data.rs_user,
        token,
        email: data.rs_user?.email ?? data.rs_seller_email ?? null
      });
    })();
    return true;
  }

  if (type === "RS_LOGIN") {
    const session = message.session;
    const user = message.user;
    const token = session?.access_token ?? null;
    const supabaseUrl = message.supabaseUrl ? normalizeSupabaseUrl(message.supabaseUrl) : null;
    const anonKey = message.anonKey || null;
    const ttlSec = typeof session?.expires_in === "number" ? session.expires_in : 3600;
    const rsExpiresAt = Date.now() + ttlSec * 1000 - 120000;

    chrome.storage.local.set(
      {
        rs_session: session,
        rs_user: user,
        rs_auth_token: token ?? null,
        rs_seller_email: user?.email ?? null,
        ...(supabaseUrl ? { rs_supabase_url: supabaseUrl } : {}),
        ...(anonKey ? { rs_supabase_anon_key: anonKey } : {}),
        rs_expires_at: rsExpiresAt
      },
      () => sendResponse({ success: true })
    );
    return true;
  }

  if (type === "RS_LOGOUT") {
    chrome.storage.local.remove(
      [
        "rs_session",
        "rs_user",
        "rs_auth_token",
        "rs_seller_email",
        "rs_supabase_url",
        "rs_supabase_anon_key",
        "rs_expires_at"
      ],
      () => sendResponse({ success: true })
    );
    return true;
  }

  if (type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: `${DASHBOARD_URL}/dashboard` }, () => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
