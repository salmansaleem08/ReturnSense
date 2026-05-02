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

    const authUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;

    (async () => {
      try {
        const res = await fetch(authUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`
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
    chrome.storage.local.get(["rs_session", "rs_user", "rs_auth_token", "rs_seller_email"], (data) => {
      const session =
        data.rs_session ||
        (data.rs_auth_token ? { access_token: data.rs_auth_token } : null);
      const token = session?.access_token ?? data.rs_auth_token ?? null;
      sendResponse({
        session,
        user: data.rs_user,
        token,
        email: data.rs_user?.email ?? data.rs_seller_email ?? null
      });
    });
    return true;
  }

  if (type === "RS_LOGIN") {
    const session = message.session;
    const user = message.user;
    const token = session?.access_token ?? null;
    chrome.storage.local.set(
      {
        rs_session: session,
        rs_user: user,
        rs_auth_token: token ?? null,
        rs_seller_email: user?.email ?? null
      },
      () => sendResponse({ success: true })
    );
    return true;
  }

  if (type === "RS_LOGOUT") {
    chrome.storage.local.remove(["rs_session", "rs_user", "rs_auth_token", "rs_seller_email"], () =>
      sendResponse({ success: true })
    );
    return true;
  }

  if (type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: `${DASHBOARD_URL}/dashboard` }, () => sendResponse({ ok: true }));
    return true;
  }

  return false;
});
