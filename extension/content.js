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

function dedupeConsecutiveByText(messages) {
  const out = [];
  let prevText = null;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const t = (m?.text || "").trim();
    if (t === prevText) continue;
    out.push({ role: m.role, text: t });
    prevText = t;
  }
  return out;
}

const TIMESTAMP_LINE_RE = /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i;
const DATE_SEPARATOR_RE = /^(Today|Yesterday|\w+ \d{1,2},?\s*\d{0,4})$/i;

const STRATEGY3_SKIP_LABELS = new Set([
  "active now",
  "seen",
  "delivered",
  "read",
  "send message",
  "voice clip",
  "photo",
  "video",
  "like",
  "unsend"
]);

function extractStrategyListItems() {
  const main = document.querySelector('[role="main"]');
  if (!main?.querySelectorAll) return [];
  const items = main.querySelectorAll('[role="listitem"]');
  const out = [];
  for (let i = 0; i < items.length; i++) {
    const el = items[i];
    if (!el) continue;
    const inner = typeof el.innerText === "string" ? el.innerText : "";
    const text = inner.trim();
    if (text.length < 3) continue;
    if (TIMESTAMP_LINE_RE.test(text)) continue;
    if (DATE_SEPARATOR_RE.test(text)) continue;
    let isSeller = false;
    let ancestor = el;
    for (let d = 0; d < 6 && ancestor; d++) {
      const st = window.getComputedStyle(ancestor);
      if (st?.justifyContent?.includes("flex-end")) {
        isSeller = true;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    out.push({ role: isSeller ? "seller" : "buyer", text });
  }
  return dedupeConsecutiveByText(out);
}

function findScrollableDivInMain() {
  const main = document.querySelector('[role="main"]');
  if (!main?.querySelectorAll) return null;
  const divs = main.querySelectorAll("div");
  for (let i = 0; i < divs.length; i++) {
    const el = divs[i];
    if (!el) continue;
    const st = window.getComputedStyle(el);
    const oy = st?.overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return el;
  }
  return null;
}

function hasButtonOrInputDescendants(el) {
  if (!el?.querySelector) return false;
  return Boolean(el.querySelector("button, input"));
}

function walkCollectMessagesFromScrollHost(node, depth, maxDepth, acc) {
  if (!node || depth > maxDepth) return;
  const kids = node.children;
  if (!kids?.length) {
    if (!hasButtonOrInputDescendants(node)) {
      const inner = typeof node.innerText === "string" ? node.innerText.trim() : "";
      if (inner.length > 4) acc.push({ role: "unknown", text: inner });
    }
    return;
  }
  for (let i = 0; i < kids.length; i++) {
    walkCollectMessagesFromScrollHost(kids[i], depth + 1, maxDepth, acc);
  }
}

function extractStrategyScrollable() {
  const host = findScrollableDivInMain();
  if (!host?.children?.length) return [];
  const acc = [];
  for (let i = 0; i < host.children.length; i++) {
    walkCollectMessagesFromScrollHost(host.children[i], 0, 3, acc);
  }
  return dedupeConsecutiveByText(acc);
}

function extractStrategyMainTextFallback() {
  const main = document.querySelector('[role="main"]');
  const raw = main && typeof main.innerText === "string" ? main.innerText : "";
  if (!raw) return [];
  const lines = raw.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] || "").trim();
    if (line.length < 3) continue;
    if (TIMESTAMP_LINE_RE.test(line)) continue;
    const low = line.toLowerCase();
    if (STRATEGY3_SKIP_LABELS.has(low)) continue;
    out.push({ role: "unknown", text: line });
  }
  return dedupeConsecutiveByText(out);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRsLoadingStatus(text) {
  const el = document.getElementById("rs-loading-status");
  if (el) el.textContent = text;
}

/**
 * Reads DM messages with retries and multiple strategies. Always returns an array (possibly empty).
 */
async function extractChatMessages() {
  setRsLoadingStatus("Reading chat... (attempt 1/8)");

  let best = [];

  for (let attempt = 1; attempt <= 8; attempt++) {
    setRsLoadingStatus(`Reading chat... (attempt ${attempt}/8)`);

    let usedStrategy = 0;
    let batch = [];

    batch = extractStrategyListItems();
    if (batch.length) usedStrategy = 1;
    if (batch.length >= 3) {
      console.log(`[RS] Extracted ${batch.length} messages via strategy 1`);
      return batch;
    }

    const s2 = extractStrategyScrollable();
    if (s2.length > batch.length) {
      batch = s2;
      usedStrategy = 2;
    }
    if (batch.length >= 3) {
      console.log(`[RS] Extracted ${batch.length} messages via strategy ${usedStrategy || 2}`);
      return batch;
    }

    const s3 = extractStrategyMainTextFallback();
    if (s3.length > batch.length) {
      batch = s3;
      usedStrategy = 3;
    }

    console.log(`[RS] Extracted ${batch.length} messages via strategy ${usedStrategy || 3}`);

    if (batch.length >= 3) return batch;

    if (batch.length > best.length) best = batch;

    if (attempt < 8) await sleep(500);
  }

  return best.length ? best : [];
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

/** Reserved title segments that are not Instagram usernames. */
const TITLE_SKIP = new Set(
  ["instagram", "direct", "chats", "inbox", ""].map((s) => s.toLowerCase())
);

/** Strategy 2: username-like token (word chars, underscores, dots). */
function looksLikeUsernameToken(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (!t.length || t.includes(" ") || t.length > 30 || t.length < 1) return false;
  return /^[\w.]+$/.test(t);
}

function extractBuyerUsername() {
  /** @param {number} n @param {string|null|undefined} found */
  const logStrategy = (n, found) => {
    console.log(`[RS] Username strategy ${n}: "${found ?? null}"`);
  };

  // Strategy 1 — Page title
  try {
    const title = typeof document.title === "string" ? document.title : "";
    const parts = title.split(" • ");
    const first = (parts[0] || "").trim();
    if (first && !TITLE_SKIP.has(first.toLowerCase()) && first.length < 50) {
      logStrategy(1, first);
      return first.replace(/^@/, "");
    }
    logStrategy(1, null);
  } catch (_e) {
    logStrategy(1, null);
  }

  // Strategy 2 — Active sidebar item in Chats nav
  try {
    let chatNav = null;
    const all = document.querySelectorAll("[aria-label]");
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      const label = el?.getAttribute?.("aria-label") || "";
      if (/chats/i.test(label)) {
        chatNav = el;
        break;
      }
    }
    const searchRoots = [];
    if (chatNav) searchRoots.push(chatNav);
    searchRoots.push(document.body);

    for (let r = 0; r < searchRoots.length; r++) {
      const root = searchRoots[r];
      if (!root?.querySelectorAll) continue;
      const items = root.querySelectorAll('[role="listitem"]');
      for (let j = 0; j < items.length; j++) {
        const item = items[j];
        if (!item) continue;
        const selected =
          item.getAttribute?.("aria-selected") === "true" ||
          item.getAttribute?.("aria-current") === "true";
        if (!selected) continue;
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        while (node) {
          const raw = node.textContent != null ? String(node.textContent) : "";
          const chunk = raw.trim();
          if (looksLikeUsernameToken(chunk)) {
            logStrategy(2, chunk);
            return chunk.replace(/^@/, "");
          }
          node = walker.nextNode();
        }
      }
    }
    logStrategy(2, null);
  } catch (_e) {
    logStrategy(2, null);
  }

  // Strategy 3 — Header anchor tags in main
  try {
    const main = document.querySelector('[role="main"]');
    if (main?.querySelectorAll) {
      const anchors = main.querySelectorAll("a[href]");
      const rejectSeg = new Set(["direct", "inbox", "p", "reel", "explore", "accounts", "stories", "tv", "audio"]);
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const href = a?.getAttribute?.("href") || "";
        if (!href) continue;
        let path = "";
        try {
          path = new URL(href, window.location.origin).pathname || "";
        } catch (_e2) {
          continue;
        }
        const segments = path.split("/").filter(Boolean);
        for (let s = 0; s < segments.length; s++) {
          const seg = segments[s];
          if (!seg || rejectSeg.has(seg.toLowerCase())) continue;
          if (seg.length > 30) continue;
          if (/\.(jpe?g|png|gif|webp|mp4|mov)$/i.test(seg)) continue;
          logStrategy(3, seg);
          return seg;
        }
      }
    }
    logStrategy(3, null);
  } catch (_e) {
    logStrategy(3, null);
  }

  // Strategy 4 — Heading element in main
  try {
    const heading = document.querySelector('[role="main"] h1, [role="main"] [role="heading"]');
    if (heading) {
      const inner = typeof heading.innerText === "string" ? heading.innerText.trim() : "";
      if (inner && inner.length > 0 && inner.length < 50 && !/\n/.test(inner)) {
        logStrategy(4, inner);
        return inner.replace(/^@/, "");
      }
    }
    logStrategy(4, null);
  } catch (_e) {
    logStrategy(4, null);
  }

  // Strategy 5 — Aria-label in main
  try {
    const main = document.querySelector('[role="main"]');
    if (main?.querySelectorAll) {
      const labeled = main.querySelectorAll("[aria-label]");
      const re = /(?:conversation with|chat with|messaging with)\s+(.+)/i;
      for (let i = 0; i < labeled.length; i++) {
        const el = labeled[i];
        const label = el?.getAttribute?.("aria-label") || "";
        const m = label.match(re);
        if (m && m[1]) {
          const name = m[1].trim();
          if (name && name.length < 50) {
            logStrategy(5, name);
            return name.replace(/^@/, "");
          }
        }
      }
    }
    logStrategy(5, null);
  } catch (_e) {
    logStrategy(5, null);
  }

  // Strategy 6 — URL path parsing
  try {
    const path = window.location?.pathname || "";
    const segments = path.split("/").filter(Boolean);
    const reject = new Set(["direct", "inbox", "t", "p", "reel", "explore", "stories"]);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg || reject.has(seg.toLowerCase())) continue;
      if (/^\d{7,}$/.test(seg)) continue;
      if (seg.length >= 1 && seg.length <= 30) {
        logStrategy(6, seg);
        return seg;
      }
    }
    logStrategy(6, null);
  } catch (_e) {
    logStrategy(6, null);
  }

  return "unknown_buyer";
}

function closePanel() {
  document.getElementById("rs-panel")?.remove();
}

function showExtractionLoadingPanel() {
  closePanel();
  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.innerHTML = `
    <div id="rs-panel-header">
      <span>🛡 ReturnSense</span>
      <button type="button" class="rs-close-btn" id="rs-close-extract" aria-label="Close">×</button>
    </div>
    <div id="rs-panel-body">
      <p id="rs-loading-status" style="color:#6B7280;font-size:12px;margin:0;">Reading chat... (attempt 1/8)</p>
    </div>`;
  document.body.appendChild(panel);
  const closeBtn = document.getElementById("rs-close-extract");
  if (closeBtn) closeBtn.addEventListener("click", () => closePanel());
}

function renderPanelBase(username, messages) {
  const msgCount = Array.isArray(messages) ? messages.length : 0;
  const lowMsgWarning =
    msgCount < 3
      ? `<p class="rs-popup-help" style="color:#6B7280;font-size:12px;">Only ${msgCount} message(s) found — analysis may have limited accuracy</p>`
      : "";

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
        ${lowMsgWarning}
        <button id="rs-submit-analysis" class="rs-popup-button rs-popup-button-primary">Run Analysis</button>
        <p class="rs-popup-help">Conversation content will be analyzed by AI.</p>
      </div>
    `;
  document.body.appendChild(panel);
  document.getElementById("rs-close-panel")?.addEventListener("click", closePanel);
  return panel;
}

async function openAnalysisPanel() {
  showExtractionLoadingPanel();
  try {
    await ensureChatHistoryLoaded();
  } catch (_e) {
    // Continue with whatever loaded.
  }

  const messages = await extractChatMessages();
  const username = extractBuyerUsername() || "unknown_buyer";

  renderPanelBase(username, messages);
  document.getElementById("rs-submit-analysis")?.addEventListener("click", () => {
    const phone = document.getElementById("rs-phone")?.value || "";
    const address = document.getElementById("rs-address")?.value || "";
    submitForAnalysis({ messages, username, phone, address });
  });
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
  fab.addEventListener("click", () => void openAnalysisPanel());
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
    btn.addEventListener("click", () => void openAnalysisPanel());
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
