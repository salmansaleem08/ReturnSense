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

const PHONE_BOOST_RE =
  /number|no\.|no\s|contact|call|whatsapp|wp|watsapp|mere number|my number|mera number|apna number/i;

const PHONE_SCAN_RE =
  /((\+92|0092|92|0)[.\- ]?(3\d{2})[.\- ]?\d{7})|(\+[1-9]\d{1,3}[.\- ]?\d{6,14})|(0[2-9]\d[.\- ]?\d{7,8})/g;

function cleanPhoneMatch(raw) {
  if (!raw || typeof raw !== "string") return null;
  const s = raw.replace(/[\s.\-]+/g, "");
  return s.length ? s : null;
}

/**
 * Scans buyer-facing messages for Pakistan/international phone patterns.
 * @param {Array<{ role: string; text: string }>} messages
 * @returns {string|null}
 */
function autoDetectPhone(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const prioritized = [
    ...messages.filter((m) => m && (m.role === "buyer" || m.role === "unknown")),
    ...messages.filter((m) => m && m.role === "seller")
  ];

  /** @type {Array<{ cleaned: string; boosted: boolean; order: number }>} */
  const candidates = [];
  let order = 0;

  for (let i = 0; i < prioritized.length; i++) {
    const msg = prioritized[i];
    const text = typeof msg?.text === "string" ? msg.text : "";
    if (!text) continue;
    const boosted = PHONE_BOOST_RE.test(text);
    PHONE_SCAN_RE.lastIndex = 0;
    let match;
    while ((match = PHONE_SCAN_RE.exec(text)) !== null) {
      const cleaned = cleanPhoneMatch(match[0]);
      if (cleaned) {
        candidates.push({ cleaned, boosted, order });
        order += 1;
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.boosted !== b.boosted) return a.boosted ? -1 : 1;
    return a.order - b.order;
  });

  const seen = new Set();
  for (let j = 0; j < candidates.length; j++) {
    const c = candidates[j].cleaned;
    if (seen.has(c)) continue;
    seen.add(c);
    return c;
  }

  return null;
}

const ADDRESS_KEYWORDS = [
  "house",
  "flat",
  "floor",
  "apartment",
  "plot",
  "street",
  "road",
  "avenue",
  "lane",
  "sector",
  "block",
  "phase",
  "town",
  "colony",
  "society",
  "near",
  "opposite",
  "behind",
  "beside",
  "mohallah",
  "mohalla",
  "gali",
  "chowk",
  "bazar",
  "bazaar",
  "market",
  "DHA",
  "Gulshan",
  "Gulberg",
  "Clifton",
  "Defence",
  "Bahria",
  "Askari",
  "Cantt"
];

const PK_CITIES = [
  "Karachi",
  "Lahore",
  "Islamabad",
  "Rawalpindi",
  "Faisalabad",
  "Multan",
  "Peshawar",
  "Quetta",
  "Sialkot",
  "Gujranwala",
  "Hyderabad",
  "Abbottabad",
  "Bahawalpur",
  "Sargodha",
  "Sheikhupura",
  "Jhang",
  "Rahim Yar Khan",
  "Larkana",
  "Mardan",
  "Kasur",
  "Okara",
  "Sahiwal",
  "Wah",
  "Taxila",
  "Attock",
  "Chakwal",
  "Jhelum",
  "Gujrat",
  "Hafizabad",
  "Mandi Bahauddin"
];

const COMMITMENT_PHRASES = [
  "okay",
  "ok",
  "theek hai",
  "theek",
  "bhej do",
  "send karo",
  "confirm",
  "yes",
  "ha",
  "haan",
  "done",
  "agreed",
  "zaroor",
  "bilkul"
];

/**
 * Heuristic delivery-address detection from buyer messages.
 * @param {Array<{ role: string; text: string }>} messages
 * @returns {string|null}
 */
function autoDetectAddress(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;

  /** @type {Array<{ score: number; text: string }>} */
  const scored = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || (msg.role !== "buyer" && msg.role !== "unknown")) continue;

    const text = typeof msg.text === "string" ? msg.text : "";
    const trimmed = text.trim();
    if (!trimmed) continue;

    const low = trimmed.toLowerCase();
    let score = 0;

    for (let k = 0; k < ADDRESS_KEYWORDS.length; k++) {
      const kw = ADDRESS_KEYWORDS[k];
      if (low.includes(String(kw).toLowerCase())) score += 3;
    }

    for (let c = 0; c < PK_CITIES.length; c++) {
      const city = PK_CITIES[c];
      if (low.includes(String(city).toLowerCase())) score += 5;
    }

    if (trimmed.length > 30) score += 2;

    if (i > 0) {
      const prev = messages[i - 1];
      const prevText = typeof prev?.text === "string" ? prev.text.toLowerCase() : "";
      if (prevText) {
        for (let p = 0; p < COMMITMENT_PHRASES.length; p++) {
          if (prevText.includes(COMMITMENT_PHRASES[p].toLowerCase())) {
            score += 4;
            break;
          }
        }
      }
    }

    scored.push({ score, text: trimmed });
  }

  const above = scored.filter((s) => s.score > 3);
  if (!above.length) return null;

  above.sort((a, b) => b.score - a.score);
  return above[0].text;
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

/** @type {HTMLElement | null} */
let rsMainMarginElement = null;
let lastUsername = "unknown_buyer";
/** @type {Array<{ role: string; text: string }>} */
let lastMessages = [];
/** @type {string | null} */
let lastSubmittedPhone = null;
/** @type {string | null} */
let lastSubmittedAddress = null;

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyInstagramMainMargin() {
  removeInstagramMainMargin();
  const main = document.querySelector('[role="main"]');
  const wrap = main?.closest?.("div[style]") ?? main ?? document.body;
  rsMainMarginElement = wrap;
  if (wrap?.style) wrap.style.marginRight = "400px";
}

function removeInstagramMainMargin() {
  if (rsMainMarginElement?.style) rsMainMarginElement.style.marginRight = "";
  rsMainMarginElement = null;
}

function closePanel() {
  removeInstagramMainMargin();
  document.getElementById("rs-panel")?.remove();
}

function showExtractionLoadingPanel() {
  closePanel();
  applyInstagramMainMargin();
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

/**
 * @param {string} username
 * @param {Array<{ role: string; text: string }>} messages
 */
function openAnalysisPanel(username, messages) {
  const detectedPhone = autoDetectPhone(messages);
  const detectedAddress = autoDetectAddress(messages);

  const safeUser = escapeHtml(username || "unknown_buyer");
  const msgCount = Array.isArray(messages) ? messages.length : 0;
  const scrollWarn =
    msgCount < 3
      ? `<div style="color:#6B7280;font-size:11px;margin-bottom:8px;">Only ${msgCount} message(s) read — try scrolling the chat before analyzing</div>`
      : "";

  const phoneVal = escapeHtml(detectedPhone ?? "");
  const addrEscaped = escapeHtml(detectedAddress ?? "");

  const phoneAutoStyle = detectedPhone ? "color:#16a34a;" : "color:#9CA3AF;";
  const addrAutoStyle = detectedAddress ? "color:#16a34a;" : "color:#9CA3AF;";
  const phoneAutoText = detectedPhone ? "✓ Auto-detected from chat" : "Not detected — enter manually";
  const addrAutoText = detectedAddress ? "✓ Auto-detected from chat" : "Not detected — enter manually";

  closePanel();
  applyInstagramMainMargin();

  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.innerHTML = `
    <div id="rs-panel-header">
      <span>🛡 ReturnSense</span>
      <button type="button" class="rs-close-btn" id="rs-close-panel" aria-label="Close">×</button>
    </div>
    <div id="rs-panel-body">
      <div class="rs-card">
        <div class="rs-card-body">
          <div style="color:#6B7280;font-size:12px;margin-bottom:10px;">Analyzing buyer: <strong style="color:#1E40AF;">@${safeUser}</strong></div>
          <label style="display:block;font-weight:600;color:#374151;font-size:13px;">📱 Phone Number</label>
          <input id="rs-phone" class="rs-input" type="text" value="${phoneVal}" autocomplete="off" />
          <div class="rs-auto-label" style="${phoneAutoStyle}">${phoneAutoText}</div>
          <label style="display:block;margin-top:10px;font-weight:600;color:#374151;font-size:13px;">📍 Delivery Address</label>
          <textarea id="rs-address" class="rs-input" rows="3">${addrEscaped}</textarea>
          <div class="rs-auto-label" style="${addrAutoStyle}">${addrAutoText}</div>
          ${scrollWarn}
          <button type="button" id="rs-submit" class="rs-action-btn rs-btn-primary" style="margin-top:10px;">Run Analysis</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const closeBtn = document.getElementById("rs-close-panel");
  if (closeBtn) closeBtn.addEventListener("click", () => closePanel());

  const submitBtn = document.getElementById("rs-submit");
  if (submitBtn) {
    submitBtn.addEventListener("click", () => {
      const phoneEl = document.getElementById("rs-phone");
      const addrEl = document.getElementById("rs-address");
      const phoneValue =
        phoneEl && typeof phoneEl.value === "string" ? phoneEl.value.trim() : "";
      const addressValue =
        addrEl && typeof addrEl.value === "string" ? addrEl.value.trim() : "";
      submitForAnalysis({
        messages,
        username: username || "unknown_buyer",
        phone: phoneValue || null,
        address: addressValue || null
      });
    });
  }
}

async function launchBuyerAnalysis() {
  showExtractionLoadingPanel();
  try {
    await ensureChatHistoryLoaded();
  } catch (_e) {
    // Continue with whatever loaded.
  }

  const messages = await extractChatMessages();
  const username = extractBuyerUsername() || "unknown_buyer";
  openAnalysisPanel(username, messages);
}

function getTokenFromBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (response) => resolve(response || {}));
  });
}

function showLoading() {
  const body = document.getElementById("rs-panel-body");
  if (!body) return;
  body.innerHTML = `
    <div class="rs-spinner-wrap">
      <div class="rs-spinner"></div>
      <div style="color:#374151;font-size:14px;font-weight:700;">Analyzing buyer...</div>
      <div style="color:#9CA3AF;font-size:12px;text-align:center;line-height:1.4;">Checking phone · Verifying address · Running AI analysis</div>
    </div>`;
}

async function submitForAnalysis({ messages, username, phone, address }) {
  lastUsername = username || "unknown_buyer";
  lastMessages = Array.isArray(messages) ? messages.slice() : [];
  lastSubmittedPhone = phone ?? null;
  lastSubmittedAddress = address ?? null;

  showLoading();
  const authData = await getTokenFromBackground();
  const token = authData?.token;

  if (!token) {
    const body = document.getElementById("rs-panel-body");
    if (body) {
      body.innerHTML = `<p style="color:#b91c1c;font-size:13px;padding:12px;">Please set up your token in the extension popup first.</p>`;
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
    const errBody = document.getElementById("rs-panel-body");
    if (errBody) {
      const msg = error instanceof Error ? error.message : "Request failed. Please try again.";
      errBody.innerHTML = `<p style="color:#b91c1c;font-size:13px;padding:12px;">${escapeHtml(msg)}</p>`;
    }
  }
}

/**
 * @param {Record<string, unknown>} result
 */
function displayResult(result) {
  const body = document.getElementById("rs-panel-body");
  if (!body) return;

  const scoreRaw = result?.trust_score;
  const score = typeof scoreRaw === "number" && !Number.isNaN(scoreRaw) ? scoreRaw : 0;
  const riskColor =
    score >= 75 ? "#16a34a" : score >= 55 ? "#ca8a04" : score >= 35 ? "#ea580c" : "#dc2626";

  const riskKey = String(result?.risk_level ?? "critical").toLowerCase();
  const riskLabel =
    riskKey === "low"
      ? "LOW RISK"
      : riskKey === "medium"
        ? "MEDIUM RISK"
        : riskKey === "high"
          ? "HIGH RISK"
          : "CRITICAL RISK";

  const analystNotes =
    (typeof result?.analyst_notes === "string" && result.analyst_notes) ||
    "No analyst notes provided.";

  const circumference = 2 * Math.PI * 46;
  const dashOffset = circumference * (1 - Math.min(100, Math.max(0, score)) / 100);

  const phone = result?.phone_analysis;
  const address = result?.address_analysis;

  let phoneBlock = "";
  if (phone == null) {
    phoneBlock = `<p style="color:#6B7280;font-size:13px;">No phone data returned from server.</p>`;
  } else if (phone.configured === false) {
    phoneBlock = `<p style="color:#6B7280;font-size:13px;">Phone validation is not configured. Add your ABSTRACT_API_KEY to the server environment to enable carrier and VoIP detection.</p>`;
  } else if (phone.phone_valid === null) {
    phoneBlock = `<p style="color:#6B7280;font-size:13px;">Number provided but validation failed.</p>`;
  } else {
    const numDisp = escapeHtml(
      String(phone.phone_international_format ?? phone.phone_local_format ?? lastSubmittedPhone ?? "")
    );
    const valid = Boolean(phone.phone_valid);
    const statusHtml = valid
      ? `<span style="color:#16a34a;font-weight:600;">✅ Valid Active Number</span>`
      : `<span style="color:#dc2626;font-weight:600;">❌ Invalid or Inactive</span>`;
    const typeStr = escapeHtml(String(phone.phone_type ?? "Unknown"));
    const typeExtra = phone.phone_is_voip ? ` <span style="color:#dc2626;">⚠️ VoIP</span>` : "";
    const carrier = escapeHtml(String(phone.phone_carrier ?? "Unknown"));
    const country = escapeHtml(String(phone.phone_country ?? "Unknown"));
    phoneBlock = `
      <div class="rs-row"><span class="rs-row-label">Number</span><span class="rs-row-value">${numDisp || "—"}</span></div>
      <div class="rs-row"><span class="rs-row-label">Status</span><span class="rs-row-value">${statusHtml}</span></div>
      <div class="rs-row"><span class="rs-row-label">Type</span><span class="rs-row-value">${typeStr}${typeExtra}</span></div>
      <div class="rs-row"><span class="rs-row-label">Carrier</span><span class="rs-row-value">${carrier}</span></div>
      <div class="rs-row"><span class="rs-row-label">Country</span><span class="rs-row-value">${country}</span></div>
      ${phone.phone_is_voip ? `<div class="rs-voip-warning">⚠️ HIGH RISK — VoIP numbers are commonly used for fake orders. Consider requesting an alternate contact.</div>` : ""}`;
  }

  let addressBlock = "";
  if (address == null) {
    addressBlock = `<p style="color:#6B7280;font-size:13px;">No address data returned from server.</p>`;
  } else if (address.configured === false) {
    addressBlock = `<p style="color:#6B7280;font-size:13px;">Address geocoding is not configured. Add your GOOGLE_MAPS_API_KEY to the server environment to enable map verification.</p>`;
  } else if (!address.address_found) {
    addressBlock = `<p style="color:#6B7280;font-size:13px;">Address could not be located on map. Try resubmitting with a more specific address including street number and city name.</p>`;
  } else {
    const q = typeof address.address_quality_score === "number" ? address.address_quality_score : 0;
    const barColor = q > 70 ? "#16a34a" : q > 40 ? "#ca8a04" : "#dc2626";
    const prec = String(address.address_precision ?? "");
    let precLabel = "Approximate street";
    if (prec === "ROOFTOP") precLabel = "Exact location ✅";
    else if (prec === "APPROXIMATE") precLabel = "⚠️ Area only — imprecise";
    const qualWord =
      q > 85 ? "Excellent" : q > 60 ? "Good" : q > 30 ? "Fair — may cause delivery issues" : "Poor — too vague";
    const lat = address.address_lat;
    const lng = address.address_lng;
    const mapIframe =
      lat != null && lng != null
        ? `<iframe class="rs-map-iframe" loading="lazy" title="Map" src="https://www.google.com/maps?q=${encodeURIComponent(String(lat))},${encodeURIComponent(String(lng))}&z=15&output=embed"></iframe>`
        : "";
    addressBlock = `
      <p style="font-size:13px;color:#111827;line-height:1.45;margin:0 0 8px;">${escapeHtml(String(address.address_formatted ?? ""))}</p>
      <div class="rs-row"><span class="rs-row-label">City</span><span class="rs-row-value">${escapeHtml(String(address.address_city ?? ""))}</span></div>
      <div class="rs-row"><span class="rs-row-label">Province</span><span class="rs-row-value">${escapeHtml(String(address.address_province ?? ""))}</span></div>
      <div class="rs-row"><span class="rs-row-label">Precision</span><span class="rs-row-value">${escapeHtml(precLabel)}</span></div>
      <div style="font-size:12px;color:#374151;margin-top:6px;">Quality: ${qualWord} (${q}/100)</div>
      <div class="rs-progress-bar-wrap"><div class="rs-progress-bar-fill" style="width:${q}%;background:${barColor};"></div></div>
      ${mapIframe}`;
  }

  const pos = Array.isArray(result?.positive_signals) ? result.positive_signals : [];
  const neg = Array.isArray(result?.negative_signals) ? result.negative_signals : [];
  const posHtml =
    pos.length > 0
      ? pos.map((s) => `<span class="rs-badge-green">${escapeHtml(String(s))}</span>`).join("")
      : `<span style="color:#9CA3AF;font-size:12px;">None detected</span>`;
  const negHtml =
    neg.length > 0
      ? neg.map((s) => `<span class="rs-badge-red">${escapeHtml(String(s))}</span>`).join("")
      : `<span style="color:#9CA3AF;font-size:12px;">None detected</span>`;

  const ser = escapeHtml(String(result?.buyer_seriousness ?? "—"));
  const committed = result?.commitment_confirmed === true;
  const commQ = escapeHtml(String(result?.communication_quality ?? "—"));
  const reasons = Array.isArray(result?.ai_reasons) ? result.ai_reasons : [];
  const reasonsHtml = reasons
    .map((r) => `<div style="border-bottom:1px solid #F3F4F6;padding:6px 0;color:#374151;font-size:13px;">• ${escapeHtml(String(r))}</div>`)
    .join("");

  const recRaw = String(result?.recommendation ?? "caution").toLowerCase();
  let recColor = "#ca8a04";
  let recText = "USE CAUTION";
  if (recRaw === "proceed") {
    recColor = "#16a34a";
    recText = "PROCEED WITH ORDER";
  } else if (recRaw === "hold") {
    recColor = "#ea580c";
    recText = "HOLD ORDER";
  } else if (recRaw === "reject") {
    recColor = "#dc2626";
    recText = "REJECT ORDER";
  }
  const recBg = `${recColor}26`;

  const hist = Array.isArray(result?.historical_data) ? result.historical_data : [];
  let histHtml = "";
  if (!hist.length) {
    histHtml = `<p style="font-size:13px;color:#374151;margin:0;">No prior records found for this buyer in the ReturnSense network.</p>
      <p style="color:#16a34a;font-size:13px;margin:8px 0 0;">✅ No red flags from history.</p>`;
  } else {
    const rows = hist
      .map((row) => {
        const o = String(row?.outcome ?? "");
        let bg = "#F8FAFC";
        if (o === "delivered") bg = "#F0FDF4";
        else if (o === "returned") bg = "#FFFBEB";
        else if (o === "fake") bg = "#FEF2F2";
        const dRaw = row?.outcome_marked_at;
        let dateStr = "—";
        if (dRaw) {
          try {
            dateStr = new Date(String(dRaw)).toLocaleDateString();
          } catch (_e) {
            dateStr = "—";
          }
        }
        return `<tr style="background:${bg};"><td>${escapeHtml(o)}</td><td>${escapeHtml(dateStr)}</td></tr>`;
      })
      .join("");
    histHtml = `<table class="rs-history-table"><thead><tr><th>Outcome</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  const buyerIdDisp = escapeHtml(String(result?.buyer_id ?? "—"));

  body.innerHTML = `
    <div class="rs-card" style="border-top:3px solid ${riskColor};">
      <div class="rs-card-body">
        <div class="rs-score-wrap">
          <svg class="rs-score-svg" viewBox="0 0 120 120" aria-hidden="true">
            <circle cx="60" cy="60" r="46" fill="none" stroke="#F3F4F6" stroke-width="10" />
            <circle cx="60" cy="60" r="46" fill="none" stroke="${riskColor}" stroke-width="10" stroke-linecap="round"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${dashOffset}"
              transform="rotate(-90 60 60)" />
            <text x="60" y="60" text-anchor="middle" dominant-baseline="central" fill="${riskColor}" font-size="26" font-weight="800">${score}</text>
          </svg>
          <span class="rs-risk-badge" style="background:${riskColor};">${riskLabel}</span>
          <div class="rs-analyst-notes">${escapeHtml(analystNotes)}</div>
        </div>
      </div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">📱 Phone Analysis</div>
      <div class="rs-card-body">${phoneBlock}</div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">📍 Address Analysis</div>
      <div class="rs-card-body">${addressBlock}</div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">🤖 AI Behavioral Analysis</div>
      <div class="rs-card-body">
        <div class="rs-signals-grid">
          <div>
            <div class="rs-signals-col-title" style="color:#16a34a;">✅ Positive</div>
            <div>${posHtml}</div>
          </div>
          <div>
            <div class="rs-signals-col-title" style="color:#dc2626;">⚠️ Risks</div>
            <div>${negHtml}</div>
          </div>
        </div>
        <div class="rs-stats-row">
          <span>Seriousness: ${ser}</span><span>·</span>
          <span>Committed: ${committed ? "Yes ✅" : "No"}</span><span>·</span>
          <span>Communication: ${commQ}</span>
        </div>
        ${reasonsHtml}
        <div class="rs-recommendation" style="background:${recBg};color:${recColor};border-color:${recColor};">${recText}</div>
      </div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">📋 Buyer History</div>
      <div class="rs-card-body">${histHtml}</div>
    </div>

    <div class="rs-card">
      <div class="rs-card-body">
        <button type="button" class="rs-action-btn rs-btn-primary" id="rs-view-report">View Full Report →</button>
        <button type="button" class="rs-action-btn rs-btn-secondary" id="rs-new-analysis">New Analysis</button>
        <div style="text-align:center;color:#9CA3AF;font-size:11px;margin-top:4px;">Analysis ID: ${buyerIdDisp} | Powered by ReturnSense</div>
      </div>
    </div>`;

  const viewBtn = document.getElementById("rs-view-report");
  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      const u = result?.dashboard_url;
      if (typeof u === "string" && u) window.open(u, "_blank", "noopener,noreferrer");
    });
  }
  const newBtn = document.getElementById("rs-new-analysis");
  if (newBtn) {
    newBtn.addEventListener("click", () => {
      openAnalysisPanel(lastUsername, lastMessages);
    });
  }
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
  fab.addEventListener("click", () => void launchBuyerAnalysis());
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
    btn.addEventListener("click", () => void launchBuyerAnalysis());
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
  removeInstagramMainMargin();
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
