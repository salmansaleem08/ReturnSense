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

/** Scroll-capture mode: accumulates messages while user scrolls the thread. */
let capturedMessages = [];
let isCapturing = false;
let captureObserver = null;
let captureIdleTimer = null;
let captureUsernameForIdle = null;

let lastUsername = "unknown_buyer";
/** @type {Array<{ role: string; text: string }>} */
let lastMessages = [];

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

function resetCaptureIdleTimer() {
  if (captureIdleTimer) {
    clearTimeout(captureIdleTimer);
    captureIdleTimer = null;
  }
  captureIdleTimer = setTimeout(() => {
    console.log("[RS] Idle timeout (60s without new messages); finalizing capture");
    if (isCapturing && captureUsernameForIdle != null) {
      finalizeCaptureAndAnalyze(captureUsernameForIdle);
    }
  }, 60000);
}

/**
 * Merges visible DOM messages into `capturedMessages` while user scrolls.
 */
function harvestVisibleMessages() {
  try {
    const main = document.querySelector('[role="main"]');
    if (!main) return;

    const countBefore = capturedMessages.length;

    let elements = Array.from(main.querySelectorAll('[role="row"]'));

    if (elements.length === 0) {
      elements = Array.from(main.querySelectorAll('div[dir="auto"]')).filter((el) => {
        let rect = { left: 0, width: 0, height: 0 };
        try {
          rect = el.getBoundingClientRect?.() || rect;
        } catch (_e) {
          return false;
        }
        return rect.left > 350 && rect.width > 0 && rect.height > 0;
      });
    }

    const skipPatterns = [
      /^\d{1,2}:\d{2}(\s?(AM|PM))?$/i,
      /^(Today|Yesterday|\w+ \d{1,2},?\s*\d{0,4})$/i,
      /^(Seen|Delivered|Read|Active now|Send Message|Voice clip|Photo|Video|Like|Unsend|Message\.\.\.)$/i,
      /^(Primary|General|Requests|Unread)$/i,
      /sent (an attachment|a photo|a video|a reel|a voice clip)/i
    ];

    for (let ei = 0; ei < elements.length; ei++) {
      const el = elements[ei];
      if (!el) continue;
      const text = typeof el.innerText === "string" ? el.innerText.trim() : "";
      if (!text || text.length < 2) continue;
      if (skipPatterns.some((p) => p.test(text))) continue;

      let role = "unknown";
      let ancestor = el;
      for (let i = 0; i < 8; i++) {
        ancestor = ancestor?.parentElement ?? null;
        if (!ancestor) break;
        let style = null;
        try {
          style = window.getComputedStyle(ancestor);
        } catch (_e) {
          style = null;
        }
        const jc = style?.justifyContent ?? "";
        if (jc === "flex-end") {
          role = "seller";
          break;
        }
        if (jc === "flex-start" || jc === "normal") {
          role = "buyer";
          break;
        }
      }

      if (role === "unknown") {
        try {
          const rect = el.getBoundingClientRect?.();
          const viewMid = window.innerWidth / 2;
          if (rect && rect.left + rect.width / 2 > viewMid + 60) role = "seller";
          else if (rect && rect.left + rect.width / 2 < viewMid - 60) role = "buyer";
        } catch (_e) {
          /* keep unknown */
        }
      }

      const alreadyExists = capturedMessages.some((m) => m && m.text === text);
      if (!alreadyExists) {
        capturedMessages.push({ role, text });
      }
    }

    if (capturedMessages.length > countBefore) {
      resetCaptureIdleTimer();
    }

    const counter = document.getElementById("rs-capture-counter");
    if (counter) {
      counter.textContent = `${capturedMessages.length} messages captured`;
    }
  } catch (_err) {
    console.log("[RS] harvestVisibleMessages: safe exit");
  }
}

function showScrollPromptBanner(username) {
  document.getElementById("rs-scroll-banner")?.remove();

  const banner = document.createElement("div");
  banner.id = "rs-scroll-banner";
  banner.style.cssText =
    "position:fixed;top:0;left:0;right:0;z-index:2147483646;background:linear-gradient(135deg,#1E40AF,#1D4ED8);color:white;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,0.3);flex-wrap:wrap;";

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
      <span style="font-size:22px;">🛡</span>
      <div>
        <div style="font-weight:700;font-size:14px;">ReturnSense — Capturing Chat</div>
        <div style="font-size:12px;opacity:0.85;margin-top:2px;">
          👆 <strong>Scroll UP through the entire chat</strong> to capture all messages, then press Done
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <span id="rs-capture-counter" style="font-size:12px;opacity:0.75;background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:99px;">0 messages captured</span>
      <button type="button" id="rs-capture-done" style="background:white;color:#1E40AF;border:none;border-radius:8px;padding:8px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">✓ Done — Analyze</button>
      <button type="button" id="rs-capture-cancel" style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:8px 14px;font-size:13px;cursor:pointer;font-family:inherit;">✕</button>
    </div>
  `;

  document.body.appendChild(banner);
  document.body.style.paddingTop = "68px";

  const doneBtn = document.getElementById("rs-capture-done");
  const cancelBtn = document.getElementById("rs-capture-cancel");
  if (doneBtn) {
    doneBtn.addEventListener("click", () => {
      finalizeCaptureAndAnalyze(username);
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      stopCapture();
    });
  }
}

function stopCapture() {
  isCapturing = false;
  if (captureIdleTimer) {
    clearTimeout(captureIdleTimer);
    captureIdleTimer = null;
  }
  if (captureObserver) {
    captureObserver.disconnect();
    captureObserver = null;
  }
  document.getElementById("rs-scroll-banner")?.remove();
  document.body.style.paddingTop = "";
}

function finalizeCaptureAndAnalyze(username) {
  stopCapture();

  const messages = [...capturedMessages];
  console.log("[RS] Finalized capture:", messages.length, "messages");
  console.log("[RS] Sample:", messages.slice(0, 5));

  lastUsername = username || "unknown_buyer";
  lastMessages = messages;

  const detectedPhone = autoDetectPhone(messages);
  const detectedAddress = autoDetectAddress(messages);

  document.getElementById("rs-panel")?.remove();

  openAnalysisPanel(username, messages, detectedPhone, detectedAddress);
}

function startCaptureMode(username) {
  console.log("[RS] startCaptureMode:", username);
  isCapturing = true;
  capturedMessages = [];
  captureUsernameForIdle = username;

  showScrollPromptBanner(username);

  const main = document.querySelector('[role="main"]');
  if (!main) {
    console.log("[RS] No [role=main] — cannot observe mutations");
    return;
  }

  try {
    harvestVisibleMessages();
  } catch (_e) {
    /* safe */
  }
  resetCaptureIdleTimer();

  if (captureObserver) {
    captureObserver.disconnect();
    captureObserver = null;
  }
  captureObserver = new MutationObserver(() => {
    if (!isCapturing) return;
    try {
      harvestVisibleMessages();
    } catch (_e) {
      /* safe */
    }
  });
  captureObserver.observe(main, { childList: true, subtree: true });
}

function autoDetectPhone(messages) {
  if (!messages || messages.length === 0) return null;

  const confidenceKeywords = [
    "number",
    "no.",
    "no ",
    "contact",
    "call",
    "whatsapp",
    "wp",
    "watsapp",
    "mere number",
    "my number",
    "mera number",
    "apna number",
    "phone",
    "mob",
    "mobile",
    "cell",
    "nmbr",
    "nmber",
    "contct",
    "whats app",
    "whtsp"
  ];

  const prioritized = [
    ...messages.filter((m) => m && (m.role === "buyer" || m.role === "unknown")),
    ...messages.filter((m) => m && m.role === "seller")
  ];

  const phoneRegex =
    /(\+92|0092|92)?[\s.\-]?(0?3\d{2})[\s.\-]?\d{3}[\s.\-]?\d{4}|(\+[1-9]\d{1,3}[\s.\-]?\d{6,14})|(0[2-9]\d[\s.\-]?\d{7,8})/g;

  const results = [];

  for (let mi = 0; mi < prioritized.length; mi++) {
    const msg = prioritized[mi];
    const text = (msg && msg.text) || "";

    const rawMatches = text.match(phoneRegex);
    if (!rawMatches) continue;

    const lower = text.toLowerCase();
    const hasConfidence = confidenceKeywords.some((kw) => lower.includes(kw.toLowerCase()));

    for (let ri = 0; ri < rawMatches.length; ri++) {
      const raw = rawMatches[ri];
      let cleaned = raw.replace(/[\s.\-]/g, "").replace(/^00/, "+");
      if (/^92\d/.test(cleaned) && !cleaned.startsWith("+")) cleaned = `+${cleaned}`;
      results.push({ number: cleaned, confidence: hasConfidence ? 2 : 1 });
    }
  }

  if (results.length === 0) return null;

  results.sort((a, b) => b.confidence - a.confidence);

  const seen = new Set();
  for (let j = 0; j < results.length; j++) {
    const r = results[j];
    const normalized = r.number.replace(/\D/g, "");
    if (!seen.has(normalized)) {
      seen.add(normalized);
      console.log("[RS] autoDetectPhone found:", r.number, "confidence:", r.confidence);
      return r.number;
    }
  }

  return null;
}

function autoDetectAddress(messages) {
  if (!messages || messages.length === 0) return null;

  const addressKeywords = [
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
    "Cantt",
    "F-7",
    "F-10",
    "E-11",
    "G-9",
    "johar",
    "johar town",
    "model town",
    "garden town",
    "cavalry ground"
  ];

  const cityNames = [
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
    "Mandi Bahauddin",
    "Mirpur",
    "Muzaffarabad",
    "Sukkur",
    "Nawabshah",
    "Khuzdar",
    "Hub",
    "Turbat",
    "D.I. Khan",
    "Bannu",
    "Kohat",
    "Mingora",
    "Swat"
  ];

  const commitmentPhrases = [
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
    "bilkul",
    "thk",
    "acha",
    "accha",
    "shukriya",
    "thanks",
    "thank you",
    "order confirm",
    "pakka"
  ];

  const prioritized = [
    ...messages.filter((m) => m && (m.role === "buyer" || m.role === "unknown")),
    ...messages.filter((m) => m && m.role === "seller")
  ];

  const scored = prioritized.map((msg, idx) => {
    const text = (msg && msg.text) || "";
    const lower = text.toLowerCase();
    let score = 0;

    for (let ki = 0; ki < addressKeywords.length; ki++) {
      if (lower.includes(addressKeywords[ki].toLowerCase())) score += 3;
    }
    for (let ci = 0; ci < cityNames.length; ci++) {
      if (lower.includes(cityNames[ci].toLowerCase())) score += 5;
    }
    if (text.length > 30) score += 2;
    if (text.length > 60) score += 2;

    const prevMsg = prioritized[idx - 1];
    if (prevMsg) {
      const prevLower = ((prevMsg && prevMsg.text) || "").toLowerCase();
      if (commitmentPhrases.some((p) => prevLower.includes(p))) score += 4;
    }

    if (/\b(h#|h\s*#|house\s*#|plot\s*#|flat\s*#|no\s*\.?\s*\d+|\d+[\-\/]\w)/i.test(text)) {
      score += 5;
    }

    return { text, score };
  });

  const candidates = scored.filter((s) => s.score > 3).sort((a, b) => b.score - a.score);

  if (candidates.length > 0) {
    const top = candidates[0];
    const preview = (top.text || "").substring(0, 60);
    console.log("[RS] autoDetectAddress found candidate (score " + top.score + "):", preview);
    return top.text;
  }

  return null;
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

/** Single-word forbidden labels (Instagram chrome), case-insensitive. */
const USERNAME_FORBIDDEN = new Set(
  [
    "instagram",
    "direct",
    "inbox",
    "chats",
    "messages",
    "home",
    "explore",
    "reels",
    "notifications",
    "create"
  ].map((s) => s.toLowerCase())
);

/**
 * Normalizes and validates a username candidate per pre-filtering rules.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
function cleanUsernameCandidate(raw) {
  if (raw == null || typeof raw !== "string") return null;
  let t = raw.replace(/^\(\d+\)\s*/, "").replace(/^@/, "").trim();
  if (!t || t.includes("\n")) return null;
  if (t.length < 1 || t.length > 30) return null;
  if (USERNAME_FORBIDDEN.has(t.toLowerCase())) return null;
  return t;
}

/**
 * @param {number|string} strategyNum
 * @param {string|null} result
 */
function logUsernameStrategyResult(strategyNum, result) {
  console.log("[RS] Username strategy " + strategyNum + " result:", result);
}

function extractBuyerUsername() {
  // Strategy 1 — Page title
  try {
    const titleRaw = typeof document.title === "string" ? document.title : "";
    const firstSeg = (titleRaw.replace(/^\(\d+\)\s*/, "").split(" • ")[0] || "").trim();
    const c = cleanUsernameCandidate(firstSeg);
    logUsernameStrategyResult(1, c);
    if (c) return c;
  } catch (_e) {
    logUsernameStrategyResult(1, null);
  }

  // Strategy 2 — URL path
  try {
    const path = window.location?.pathname || "";
    const segments = path.split("/").filter(Boolean);
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) continue;
      const low = seg.toLowerCase();
      if (low === "direct" || low === "t" || low === "inbox") continue;
      if (/^\d+$/.test(seg) && seg.length > 6) continue;
      if (seg.length < 1 || seg.length > 30) continue;
      if (!/^[\w._]+$/.test(seg)) continue;
      const c = cleanUsernameCandidate(seg);
      if (c) {
        logUsernameStrategyResult(2, c);
        return c;
      }
    }
    logUsernameStrategyResult(2, null);
  } catch (_e) {
    logUsernameStrategyResult(2, null);
  }

  // Strategy 3 — Active conversation header
  const headerSelectors = [
    '[role="main"] header h2',
    '[role="main"] header [dir="auto"]',
    '[role="main"] [data-testid="conversation-info-header-title"]',
    '[role="main"] h1',
    '[role="main"] h2',
    '[role="main"] h3'
  ];
  for (let si = 0; si < headerSelectors.length; si++) {
    try {
      const el = document.querySelector(headerSelectors[si]);
      const inner = el && typeof el.innerText === "string" ? el.innerText.trim() : "";
      const c = cleanUsernameCandidate(inner);
      logUsernameStrategyResult(3, c);
      if (c) return c;
    } catch (_e) {
      logUsernameStrategyResult(3, null);
    }
  }
  logUsernameStrategyResult(3, null);

  // Strategy 4 — Active sidebar listitem (visual selection)
  try {
    const items = document.querySelectorAll('[role="listitem"]');
    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      if (!item) continue;
      const ariaSel =
        item.getAttribute?.("aria-selected") === "true" || item.querySelector?.("[aria-current='true']") != null;
      const cs = window.getComputedStyle(item);
      const bg = cs?.backgroundColor || "";
      const whiteish =
        bg === "rgb(255, 255, 255)" ||
        bg === "rgba(255, 255, 255, 1)" ||
        bg === "rgba(0, 0, 0, 0)" ||
        bg === "transparent";
      const visualSel = !whiteish && Boolean(bg);
      if (!ariaSel && !visualSel) continue;

      const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, null);
      let node = walker.nextNode();
      while (node) {
        const chunk = (node.textContent != null ? String(node.textContent) : "").trim();
        if (/^[\w._]{1,30}$/.test(chunk)) {
          const c = cleanUsernameCandidate(chunk);
          logUsernameStrategyResult(4, c);
          if (c) return c;
        }
        node = walker.nextNode();
      }
    }
    logUsernameStrategyResult(4, null);
  } catch (_e) {
    logUsernameStrategyResult(4, null);
  }

  // Strategy 5 — Aria-label in main
  try {
    const main = document.querySelector('[role="main"]');
    if (main?.querySelectorAll) {
      const labeled = main.querySelectorAll("[aria-label]");
      const re = /(?:conversation with|chat with|messaging with)\s+(.+)/i;
      for (let k = 0; k < labeled.length; k++) {
        const label = labeled[k]?.getAttribute?.("aria-label") || "";
        const m = label.match(re);
        if (m?.[1]) {
          const c = cleanUsernameCandidate(m[1].trim());
          logUsernameStrategyResult(5, c);
          if (c) return c;
        }
      }
    }
    logUsernameStrategyResult(5, null);
  } catch (_e) {
    logUsernameStrategyResult(5, null);
  }

  // Strategy 6 — dir="auto" username-shaped text in main
  try {
    const mainEl = document.querySelector('[role="main"]');
    if (mainEl?.querySelectorAll) {
      const autos = mainEl.querySelectorAll('[dir="auto"]');
      for (let a = 0; a < autos.length; a++) {
        const el = autos[a];
        const inner = el && typeof el.innerText === "string" ? el.innerText.trim() : "";
        if (!inner || inner.length > 30 || inner.includes("\n")) continue;
        if (!/^[\w._]+$/.test(inner)) continue;
        const c = cleanUsernameCandidate(inner);
        logUsernameStrategyResult(6, c);
        if (c) return c;
      }
    }
    logUsernameStrategyResult(6, null);
  } catch (_e) {
    logUsernameStrategyResult(6, null);
  }

  logUsernameStrategyResult("final", "unknown_buyer");
  return "unknown_buyer";
}

/** @type {HTMLElement | null} */
let rsMainMarginElement = null;
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
function openAnalysisPanel(username, messages, detectedPhone, detectedAddress) {
  let safeUsername = (username || "unknown_buyer").replace(/^\(\d+\)\s*/, "").trim();
  const forbidden = ["instagram", "direct", "inbox", "chats", "messages", "home", "explore"];
  if (!safeUsername || forbidden.includes(safeUsername.toLowerCase()) || safeUsername.length > 50) {
    safeUsername = "unknown_buyer";
  }
  lastUsername = safeUsername;
  lastMessages = Array.isArray(messages) ? messages.slice() : [];

  const phoneDet = detectedPhone != null ? detectedPhone : autoDetectPhone(messages);
  const addrDet = detectedAddress != null ? detectedAddress : autoDetectAddress(messages);

  const safeUser = escapeHtml(safeUsername);
  const msgCount = Array.isArray(messages) ? messages.length : 0;
  const scrollWarn =
    msgCount < 3
      ? `<div style="color:#6B7280;font-size:11px;margin-bottom:8px;">Only ${msgCount} message(s) read — try scrolling the chat before analyzing</div>`
      : "";

  const phoneVal = escapeHtml(phoneDet ?? "");
  const addrEscaped = escapeHtml(addrDet ?? "");

  const phoneAutoStyle = phoneDet ? "color:#16a34a;" : "color:#9CA3AF;";
  const addrAutoStyle = addrDet ? "color:#16a34a;" : "color:#9CA3AF;";
  const phoneAutoText = phoneDet ? "✓ Auto-detected from chat" : "Not detected — enter manually";
  const addrAutoText = addrDet ? "✓ Auto-detected from chat" : "Not detected — enter manually";

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
        username: safeUsername,
        phone: phoneValue || null,
        address: addressValue || null
      });
    });
  }
}

function launchBuyerAnalysis() {
  const username = extractBuyerUsername() || "unknown_buyer";
  startCaptureMode(username);
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
  console.log("[RS] === Analysis triggered ===");
  console.log("[RS] Username:", username);
  console.log("[RS] Messages count:", Array.isArray(messages) ? messages.length : 0);
  console.log("[RS] Messages sample:", Array.isArray(messages) ? messages.slice(0, 5) : []);
  console.log("[RS] Detected phone:", autoDetectPhone(Array.isArray(messages) ? messages : []));
  console.log("[RS] Detected address:", autoDetectAddress(Array.isArray(messages) ? messages : []));
  console.log("[RS] Submitted phone field:", phone);
  console.log("[RS] Submitted address field:", address);

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
  } else if (
    phone.not_provided === true ||
    (phone.phone_valid === null && !phone.error)
  ) {
    phoneBlock = `<p style="color:#9CA3AF;font-size:13px;margin:0;">No phone number was submitted with this analysis. Pre-fill the phone field before running analysis to enable validation.</p>`;
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
  } else if (address.not_provided === true) {
    addressBlock = `<p style="color:#9CA3AF;font-size:13px;margin:0;">No address was submitted with this analysis. Pre-fill the address field before running analysis to enable map verification.</p>`;
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
      openAnalysisPanel(
        lastUsername,
        lastMessages,
        autoDetectPhone(lastMessages),
        autoDetectAddress(lastMessages)
      );
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
    btn.className = "rs-analyze-btn";
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
