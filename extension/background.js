/** Dashboard origin — update before publishing if different from production. */
const DASHBOARD_URL = "https://return-sense-web.vercel.app";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message?.type;

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
