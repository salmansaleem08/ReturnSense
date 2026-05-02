const API_BASE = "https://return-sense-web.vercel.app";

function isInstagramHost() {
  const host = window.location.hostname.replace(/^www\./, "");
  return host === "instagram.com" || host === "m.instagram.com";
}

/** Instagram DM URLs are under /direct/... (inbox, thread, new). */
function isDirectMessagesPage() {
  if (!isInstagramHost()) return false;
  const path = window.location.pathname || "";
  return path === "/direct" || path.startsWith("/direct/");
}

let bodyObserver = null;
let observerActive = false;
let pendingDebounce = null;
let lastSyncedPath = "";

function queryWithFallbacks(selectors, root = document) {
  const base = root?.querySelector ? root : document;
  for (const selector of selectors) {
    try {
      const el = base.querySelector(selector);
      if (el) return el;
    } catch (_error) {
      // Ignore invalid selectors and continue fallback scan.
    }
  }
  return null;
}

function queryAllWithFallbacks(selectors, root = document) {
  const base = root?.querySelectorAll ? root : document;
  for (const selector of selectors) {
    try {
      const elements = base.querySelectorAll(selector);
      if (elements.length) return Array.from(elements);
    } catch (_error) {
      // Continue trying selector fallback candidates.
    }
  }
  return [];
}

/**
 * When structured message nodes are not found, Instagram still exposes the thread as plain text.
 * The API needs at least 2 messages — never send a single giant blob.
 */
function extractChatFallback(threadRoot) {
  const root = threadRoot || document.querySelector("[role='main']");
  if (!root) return [];
  const rawText = (root.innerText || "").trim();
  if (!rawText) return [];

  let segments = rawText
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3);

  if (segments.length < 2) {
    segments = rawText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length >= 3);
  }

  if (segments.length < 2 && rawText.length >= 80) {
    const mid = Math.floor(rawText.length / 2);
    const a = rawText.slice(0, mid).trim();
    const b = rawText.slice(mid).trim();
    segments = [a, b].filter((s) => s.length >= 2);
  }

  if (segments.length < 2) {
    return [];
  }

  return segments.map((text, i) => ({
    role: i % 2 === 0 ? "buyer" : "seller",
    text,
    timestamp: null
  }));
}

/** Prefer scrollable column inside the open DM (not the inbox list). */
function findMessageScrollContainer(within) {
  const root = within?.querySelector ? within : document.querySelector("[role='main']");
  if (!root?.querySelectorAll) return null;
  let best = null;
  let bestH = 0;
  root.querySelectorAll("div").forEach((el) => {
    const st = window.getComputedStyle(el);
    const oy = st.overflowY;
    if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") return;
    const h = el.scrollHeight - el.clientHeight;
    if (h > 40 && el.scrollHeight > bestH) {
      bestH = el.scrollHeight;
      best = el;
    }
  });
  return best;
}

/** Desktop DM: inbox left, thread right — prefer last main column. */
function findRightThreadColumn() {
  const main = document.querySelector("[role='main']");
  if (!main?.children?.length) return null;
  const kids = main.children;
  if (kids.length >= 2) return kids[kids.length - 1];
  return main;
}

function findActiveThreadPanel() {
  const main = document.querySelector("[role='main']");
  const rightCol = findRightThreadColumn();
  const searchRoots = [rightCol, main].filter(Boolean);
  const header = findChatHeaderToolbar();

  if (header) {
    let node = header.parentElement;
    for (let i = 0; i < 24 && node; i++) {
      const rows = node.querySelectorAll("[role='row'], [role='listitem'], div[role='presentation']");
      if (rows.length >= 2) return node;
      node = node.parentElement;
    }
  }

  for (const r of searchRoots) {
    const scrollHost = findMessageScrollContainer(r);
    if (scrollHost) return scrollHost;
  }
  return rightCol || main || document.body;
}

/**
 * Instagram lazy-loads older DM bubbles while scrolling up.
 * Scroll to top repeatedly until height stabilizes so extract sees full thread.
 */
async function ensureChatHistoryLoaded() {
  const panel = findActiveThreadPanel();
  const scrollEl = findMessageScrollContainer(panel) || findMessageScrollContainer(document.querySelector("[role='main']"));
  if (!scrollEl) return;

  let stable = 0;
  let lastH = -1;
  for (let pass = 0; pass < 48; pass++) {
    scrollEl.scrollTop = 0;
    await new Promise((r) => setTimeout(r, 420));
    const h = scrollEl.scrollHeight;
    if (h <= lastH + 8) {
      stable++;
      if (stable >= 4) break;
    } else {
      stable = 0;
      lastH = h;
    }
  }
}

function dedupeMessages(messages) {
  const out = [];
  let prev = null;
  messages.forEach((m) => {
    if (prev && prev.text === m.text && prev.role === m.role) return;
    out.push(m);
    prev = m;
  });
  return out;
}

function sanitizeMessages(messages) {
  const headerOnly = /^(Unread|Primary|General|Requests)$/i;
  return messages.filter((m) => {
    const t = (m.text || "").trim();
    if (t.length < 1) return false;
    const first = t.split("\n")[0].trim();
    if (first.length < 80 && headerOnly.test(first) && t.split("\n").length === 1) return false;
    return true;
  });
}

function extractChatMessages(threadRoot) {
  const root = threadRoot || findActiveThreadPanel();

  const messageNodes = queryAllWithFallbacks(
    [
      "[role='row']",
      "[role='listitem']",
      "[data-testid*='message']",
      "[class*='messageList'] [role='presentation']"
    ],
    root
  );

  const messages = [];
  messageNodes.forEach((el) => {
    const text = el.innerText?.trim();
    if (!text || text.length < 2) return;
    const computed = window.getComputedStyle(el);
    const parentComputed = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
    const isSeller =
      computed.justifyContent.includes("flex-end") ||
      parentComputed?.justifyContent?.includes("flex-end") ||
      el.closest("[style*='flex-end']") !== null;

    messages.push({
      role: isSeller ? "seller" : "buyer",
      text,
      timestamp: el.querySelector("time")?.getAttribute("datetime") || null
    });
  });

  let cleaned = dedupeMessages(sanitizeMessages(messages));

  if (cleaned.length < 2 && messages.length >= 2) {
    cleaned = dedupeMessages(messages);
  }

  if (cleaned.length < 2) {
    const fallback = dedupeMessages(sanitizeMessages(extractChatFallback(root)));
    if (fallback.length >= 2) return fallback;
  }

  if (!cleaned.length) {
    return dedupeMessages(sanitizeMessages(extractChatFallback(root)));
  }

  return cleaned;
}

/** Last resort: any row in thread without aggressive filtering. */
function extractChatMessagesRelaxed() {
  const root = findActiveThreadPanel();
  const nodes = root.querySelectorAll("[role='row'], [role='listitem'], li[role='listitem']");
  const out = [];
  nodes.forEach((el) => {
    const text = el.innerText?.trim();
    if (!text || text.length < 1) return;
    const computed = window.getComputedStyle(el);
    const parentComputed = el.parentElement ? window.getComputedStyle(el.parentElement) : null;
    const isSeller =
      computed.justifyContent.includes("flex-end") ||
      parentComputed?.justifyContent?.includes("flex-end") ||
      el.closest("[style*='flex-end']") !== null;
    out.push({
      role: isSeller ? "seller" : "buyer",
      text,
      timestamp: el.querySelector("time")?.getAttribute("datetime") || null
    });
  });
  const d = dedupeMessages(out);
  return d.length >= 2 ? d : [];
}

const IG_USERNAME_RESERVED = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "direct",
  "accounts",
  "legal",
  "about",
  "popular",
  "tagged",
  "tv",
  "common",
  "www"
]);

function extractUsernameFromPageLinks() {
  const main = document.querySelector("[role='main']");
  const scope = main || document;
  const links = scope.querySelectorAll('a[href*="instagram.com/"]');
  let found = null;
  links.forEach((a) => {
    const href = a.getAttribute("href") || "";
    const m = href.match(/instagram\.com\/([A-Za-z0-9._]+)\/?(?:\?|#|$)/);
    if (!m) return;
    const u = m[1];
    if (IG_USERNAME_RESERVED.has(u.toLowerCase())) return;
    if (u.length < 2 || u.length > 33) return;
    found = u;
  });
  return found;
}

function findChatHeaderToolbar() {
  return queryWithFallbacks([
    "[role='main'] header",
    "[role='main'] [role='banner']",
    "[role='main'] div[role='banner']",
    "main header",
    "[role='main'] > div > div:first-child",
    "[data-testid*='conversation'] header",
    "[data-testid*='thread'] header",
    "[aria-label*='Conversation']",
    "div[role='main'] header",
    "section[role='main'] header",
    "div[class*='x1n2onr6'] header"
  ]);
}

function extractBuyerUsername() {
  const fromPage = extractUsernameFromPageLinks();
  if (fromPage) return fromPage;

  const header = findChatHeaderToolbar();
  if (!header) return extractUsernameFromPageLinks();

  const anchors = header.querySelectorAll("a[href*='instagram.com']");
  for (const link of anchors) {
    const match = link.href.match(/instagram\.com\/([A-Za-z0-9._]+)/);
    if (match && !IG_USERNAME_RESERVED.has(match[1].toLowerCase())) return match[1];
  }

  const ariaEls = header.querySelectorAll("[aria-label]");
  for (const ariaTarget of ariaEls) {
    const label = ariaTarget.getAttribute("aria-label") || "";
    const fromAt = label.match(/@([A-Za-z0-9._]+)/);
    if (fromAt) return fromAt[1];
    const plain = label.trim();
    if (/^[A-Za-z0-9._]+$/.test(plain) && plain.length >= 2 && plain.length <= 33) return plain;
  }

  const spans = header.querySelectorAll("span[dir], h1, h2, div[dir='auto']");
  for (const span of spans) {
    const raw = span.innerText?.trim() || "";
    const oneLine = raw.split("\n")[0].replace("@", "").trim();
    if (/^[A-Za-z0-9._]+$/.test(oneLine) && oneLine.length >= 2 && oneLine.length <= 33) return oneLine;
  }

  return extractUsernameFromPageLinks();
}

function closePanel() {
  document.getElementById("rs-panel")?.remove();
}

function renderPanelBase(username) {
  closePanel();
  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.className = "rs-panel";
  panel.innerHTML = `
      <button class="rs-close" id="rs-close-panel">×</button>
      <div class="rs-panel-inner">
        <h3 class="rs-panel-title">ReturnSense Analysis</h3>
        <p>Buyer: <strong>@${username || "unknown"}</strong></p>
        <label>Phone Number</label>
        <input id="rs-phone" class="rs-popup-input" placeholder="+92 300 1234567" />
        <label>Delivery Address</label>
        <textarea id="rs-address" class="rs-popup-input" rows="3" placeholder="House 12, Street 5, DHA Phase 2, Lahore"></textarea>
        <button id="rs-submit-analysis" class="rs-popup-button rs-popup-button-primary">Run Analysis</button>
        <p class="rs-popup-help">Conversation content will be analyzed by AI.</p>
      </div>
    `;
  document.body.appendChild(panel);
  document.getElementById("rs-close-panel")?.addEventListener("click", closePanel);
  return panel;
}

async function openAnalysisPanel() {
  renderLoadingPanel("…", "Loading full conversation…");
  try {
    await ensureChatHistoryLoaded();
  } catch (_e) {
    // Continue with whatever loaded.
  }

  let username =
    extractBuyerUsername() || extractUsernameFromPageLinks() || "unknown_buyer";

  let messages = extractChatMessages();
  if (!messages || messages.length < 2) {
    messages = extractChatMessagesRelaxed();
  }
  if (!messages || messages.length < 2) {
    renderErrorPanel(
      username,
      "Could not read enough messages. Open the DM thread (click the conversation), wait for messages to load, then tap Analyze again."
    );
    return;
  }

  renderPanelBase(username);
  document.getElementById("rs-submit-analysis")?.addEventListener("click", () => {
    const phone = document.getElementById("rs-phone")?.value || "";
    const address = document.getElementById("rs-address")?.value || "";
    submitForAnalysis({ messages, username, phone, address });
  });
}

function renderLoadingPanel(username, note) {
  closePanel();
  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.className = "rs-panel";
  panel.innerHTML = `
      <button class="rs-close" id="rs-close-panel">×</button>
      <div class="rs-panel-inner">
        <h3 class="rs-panel-title">ReturnSense Analysis</h3>
        <p class="rs-popup-help">@${username || "unknown"}</p>
        <div style="display:flex;justify-content:center;padding:24px 0;"><div class="rs-spinner"></div></div>
        <p class="rs-popup-help" style="text-align:center;">${note}</p>
      </div>
    `;
  document.body.appendChild(panel);
  document.getElementById("rs-close-panel")?.addEventListener("click", closePanel);
}

function renderErrorPanel(username, msg) {
  closePanel();
  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.className = "rs-panel";
  panel.innerHTML = `
      <button class="rs-close" id="rs-close-panel">×</button>
      <div class="rs-panel-inner">
        <h3 class="rs-panel-title">ReturnSense</h3>
        <p><strong>@${username}</strong></p>
        <p class="rs-popup-help rs-error-text">${msg}</p>
      </div>
    `;
  document.body.appendChild(panel);
  document.getElementById("rs-close-panel")?.addEventListener("click", closePanel);
}

function getTokenFromBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (response) => resolve(response || {}));
  });
}

function showLoading() {
  const panel = document.querySelector("#rs-panel .rs-panel-inner");
  if (!panel) return;
  panel.innerHTML = `
      <h3 class="rs-panel-title">Analyzing Buyer</h3>
      <div style="display:flex;justify-content:center;padding:20px 0;"><div class="rs-spinner"></div></div>
      <p class="rs-popup-help" style="text-align:center;">Running AI analysis, phone checks, and address validation...</p>
    `;
}

async function submitForAnalysis({ messages, username, phone, address }) {
  showLoading();
  const authData = await getTokenFromBackground();
  const token = authData?.token;

  if (!token) {
    const panel = document.querySelector("#rs-panel .rs-panel-inner");
    if (panel) {
      panel.innerHTML = `<p class="rs-popup-help" style="color:#b91c1c;">Please set up your token in the extension popup first.</p>`;
    }
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        messages,
        username: username || "unknown_buyer",
        phone,
        address
      })
    });

    const rawText = await res.text();
    let result = {};
    try {
      result = rawText ? JSON.parse(rawText) : {};
    } catch {
      console.error("ReturnSense: analyze response was not JSON", res.status, rawText?.slice?.(0, 400));
      throw new Error(`Analysis failed (${res.status})`);
    }
    if (!res.ok) {
      console.error(
        "ReturnSense: analyze HTTP error",
        res.status,
        typeof result === "object" ? JSON.stringify(result, null, 2) : result
      );
      throw new Error(result?.error || `Analysis failed (${res.status})`);
    }
    displayResult(result);
  } catch (error) {
    const chain = [];
    let e = error;
    for (let i = 0; i < 10 && e != null; i++) {
      const step =
        e instanceof Error || (typeof e === "object" && "message" in e)
          ? { name: e.name, message: e.message, stack: e.stack }
          : { message: String(e) };
      chain.push(step);
      e = typeof e === "object" && e !== null && "cause" in e ? e.cause : null;
    }
    console.error("ReturnSense: analyze error chain\n", JSON.stringify(chain, null, 2));
    console.error("ReturnSense: analyze exception (raw Error object — expand in DevTools)", error);
    const panel = document.querySelector("#rs-panel .rs-panel-inner");
    if (panel) {
      panel.innerHTML = `<p class="rs-popup-help" style="color:#b91c1c;">${error.message || "Request failed. Please try again."}</p>`;
    }
  }
}

function displayResult(result) {
  const panel = document.getElementById("rs-panel");
  if (!panel) return;
  const score = result.trust_score;
  const color = score >= 75 ? "#16a34a" : score >= 55 ? "#ca8a04" : score >= 35 ? "#ea580c" : "#dc2626";
  const phone = result.phone_analysis;
  const address = result.address_analysis;
  const quality = address && typeof address.address_quality_score === "number" ? address.address_quality_score : 0;

  const phoneHtml =
    phone == null
      ? `<p class="rs-popup-help">Phone not verified — add a number in the panel and set <code>ABSTRACT_API_KEY</code> on the server for carrier checks.</p>`
      : `<div class="rs-kv"><span>Status</span><b>${phone.phone_valid ? "Valid" : "Invalid"}</b></div>
         <div class="rs-kv"><span>Carrier</span><b>${phone.phone_carrier || "—"}</b></div>
         <div class="rs-kv"><span>Type</span><b>${phone.phone_type || "—"}</b></div>
         <div class="rs-kv"><span>Country</span><b>${phone.phone_country || "—"}</b></div>
         ${phone.phone_is_voip ? '<span class="rs-signal-negative">VoIP warning</span>' : ""}`;

  const addressHtml =
    address == null
      ? `<p class="rs-popup-help">Address not geocoded — add a full address in the panel and <code>GOOGLE_MAPS_API_KEY</code> on the server.</p>`
      : `<p class="rs-addr-line">${address.address_formatted || "Not found on map"}</p>
         <div class="rs-kv"><span>Quality</span><b>${quality}/100</b></div>
         <div style="height:8px;background:var(--ig-border);border-radius:999px;overflow:hidden;">
           <div style="height:100%;width:${quality}%;background:${quality > 60 ? "#16a34a" : quality > 35 ? "#ea580c" : "#ed4956"};"></div>
         </div>`;

  panel.innerHTML = `
      <button class="rs-close" id="rs-close-panel">×</button>
      <div class="rs-panel-inner">
        <div class="rs-score-circle" style="border-color:${color};color:${color};">${score}</div>
        <div class="rs-risk-badge" style="background:${color};">${result.risk_level.toUpperCase()} RISK</div>

        <div class="rs-section">
          <strong>Phone analysis</strong>
          ${phoneHtml}
        </div>

        <div class="rs-section">
          <strong>Address analysis</strong>
          ${addressHtml}
        </div>

        <div class="rs-section">
          <strong>AI Signals</strong>
          ${(result.ai_reasons || []).map((r) => `<div class="rs-reason">• ${r}</div>`).join("")}
        </div>

        <a href="${result.dashboard_url}" target="_blank" class="rs-link">View Full Report →</a>
      </div>
    `;

  document.getElementById("rs-close-panel")?.addEventListener("click", closePanel);
}

function removeFloatingAnalyzeButton() {
  document.getElementById("rs-analyze-fab")?.remove();
}

function ensureFloatingAnalyzeButton() {
  if (document.getElementById("rs-analyze-btn") || document.getElementById("rs-analyze-fab")) return;
  const fab = document.createElement("button");
  fab.id = "rs-analyze-fab";
  fab.type = "button";
  fab.className = "rs-fab";
  fab.textContent = "🛡 Analyze";
  fab.title = "ReturnSense — analyze this chat";
  fab.setAttribute("aria-label", "ReturnSense analyze buyer");
  fab.addEventListener("click", openAnalysisPanel);
  document.body.appendChild(fab);
}

function tryInjectButton() {
  if (!isDirectMessagesPage()) return;

  if (document.getElementById("rs-analyze-btn")) {
    removeFloatingAnalyzeButton();
    return;
  }

  const header = findChatHeaderToolbar();
  if (header) {
    removeFloatingAnalyzeButton();
    const btn = document.createElement("button");
    btn.id = "rs-analyze-btn";
    btn.type = "button";
    btn.className = "rs-btn";
    btn.textContent = "🛡 Analyze Buyer";
    btn.title = "ReturnSense — analyze this buyer";
    btn.addEventListener("click", openAnalysisPanel);
    header.appendChild(btn);
    return;
  }

  ensureFloatingAnalyzeButton();
}

function tryDetectChat() {
  extractBuyerUsername();
}

function stopDirectMode() {
  document.getElementById("rs-analyze-btn")?.remove();
  removeFloatingAnalyzeButton();
  document.getElementById("rs-panel")?.remove();
  if (bodyObserver) {
    bodyObserver.disconnect();
    bodyObserver = null;
  }
  observerActive = false;
  if (pendingDebounce) {
    window.clearTimeout(pendingDebounce);
    pendingDebounce = null;
  }
}

function startDirectMode() {
  if (!isDirectMessagesPage() || !document.body) return;

  const pathKey = location.pathname + location.search;
  if (pathKey !== lastSyncedPath) {
    lastSyncedPath = pathKey;
    document.getElementById("rs-analyze-btn")?.remove();
    removeFloatingAnalyzeButton();
  }

  if (observerActive && bodyObserver) {
    tryInjectButton();
    return;
  }

  observerActive = true;
  bodyObserver = new MutationObserver(() => {
    if (!isDirectMessagesPage()) return;
    if (pendingDebounce) window.clearTimeout(pendingDebounce);
    pendingDebounce = window.setTimeout(() => {
      tryInjectButton();
      tryDetectChat();
    }, 100);
  });
  bodyObserver.observe(document.body, { childList: true, subtree: true });
  tryInjectButton();
  tryDetectChat();
}

function syncInstagramRoute() {
  if (!isInstagramHost()) return;

  if (isDirectMessagesPage()) {
    startDirectMode();
  } else {
    lastSyncedPath = "";
    stopDirectMode();
  }
}

function installSpaNavigationHooks() {
  let lastHref = window.location.href;
  const notify = () => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      syncInstagramRoute();
    }
  };

  window.addEventListener("popstate", notify);

  const wrap = (fn) =>
    function wrappedHistoryMethod() {
      const ret = fn.apply(this, arguments);
      notify();
      return ret;
    };

  history.pushState = wrap(history.pushState);
  history.replaceState = wrap(history.replaceState);

  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      syncInstagramRoute();
    }
  }, 500);
}

if (isInstagramHost()) {
  const boot = () => syncInstagramRoute();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  installSpaNavigationHooks();
}
