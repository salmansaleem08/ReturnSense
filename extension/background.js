/** Dashboard origin — update before publishing if different from production. */
const DASHBOARD_URL = "https://return-sense-web.vercel.app";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_TOKEN") {
    chrome.storage.local.get(["rs_auth_token", "rs_seller_email"], (data) => {
      sendResponse({
        token: data.rs_auth_token || null,
        email: data.rs_seller_email || null
      });
    });
    return true;
  }

  if (message?.type === "OPEN_DASHBOARD") {
    chrome.tabs.create({ url: `${DASHBOARD_URL}/dashboard` }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

