const API_BASE = "https://return-sense-web.vercel.app";

const RS_BRAND_LOGO =
  typeof chrome !== "undefined" && chrome.runtime?.getURL
    ? chrome.runtime.getURL("icons/brand-mark.svg")
    : "";

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
/** @type {Array<{ role: string; text: string; attribution_confidence?: number; attribution_signals?: string[] }>} */
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
      let layoutSource = "none";
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
          layoutSource = "flex-end";
          break;
        }
        if (jc === "flex-start" || jc === "normal") {
          role = "buyer";
          layoutSource = "flex-start";
          break;
        }
      }

      if (role === "unknown") {
        try {
          const rect = el.getBoundingClientRect?.();
          const viewMid = window.innerWidth / 2;
          if (rect && rect.left + rect.width / 2 > viewMid + 60) {
            role = "seller";
            layoutSource = "geometry-right";
          } else if (rect && rect.left + rect.width / 2 < viewMid - 60) {
            role = "buyer";
            layoutSource = "geometry-left";
          }
        } catch (_e) {
          /* keep unknown */
        }
      }

      /** @type {string[]} */
      const attribution_signals = [];
      let attribution_confidence = 0.41;
      if (layoutSource === "flex-end" || layoutSource === "flex-start") {
        attribution_confidence = 0.9;
        attribution_signals.push(`layout:${layoutSource}`);
      } else if (layoutSource === "geometry-right" || layoutSource === "geometry-left") {
        attribution_confidence = 0.64;
        attribution_signals.push(layoutSource);
      } else {
        attribution_signals.push("role-unknown");
      }

      const alreadyExists = capturedMessages.some((m) => m && m.text === text);
      if (!alreadyExists) {
        capturedMessages.push({ role, text, attribution_confidence, attribution_signals });
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
  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
      <div>
        <div style="font-weight:600;font-size:13px;">ReturnSense — capturing chat</div>
        <div style="font-size:11px;opacity:0.85;margin-top:2px;">
          Scroll up through the entire thread to capture messages, then tap Done
        </div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
      <span id="rs-capture-counter">0 messages captured</span>
      <button type="button" id="rs-capture-done">Done — Analyze</button>
      <button type="button" class="rs-scroll-cancel" id="rs-capture-cancel" aria-label="Cancel">Cancel</button>
    </div>
  `;

  document.body.appendChild(banner);
  document.body.style.paddingTop = "52px";

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

/**
 * @param {string|null|undefined} candidate
 * @returns {string|false}
 */
function isValidUsername(candidate) {
  try {
    if (!candidate || typeof candidate !== "string") return false;
    const cleaned = candidate.replace(/^\(\d+\)\s*/, "").replace(/^@/, "").trim();
    if (cleaned.length < 1 || cleaned.length > 40) return false;
    const forbidden = [
      "instagram",
      "direct",
      "inbox",
      "chats",
      "messages",
      "home",
      "explore",
      "reels",
      "notifications",
      "create",
      "search",
      "more",
      "threads"
    ];
    if (forbidden.includes(cleaned.toLowerCase())) return false;
    if (/\s{2,}/.test(cleaned)) return false;
    if (cleaned.includes("\n")) return false;
    return cleaned;
  } catch (_e) {
    return false;
  }
}

function extractBuyerUsername() {
  try {
    const main = document.querySelector('[role="main"]');
    if (main?.querySelectorAll) {
      const anchors = Array.from(main.querySelectorAll("a[href]"));
      const systemPaths = ["direct", "t", "inbox", "explore", "accounts", "stories", "reel", "p", "tv"];
      for (let ai = 0; ai < anchors.length; ai++) {
        const a = anchors[ai];
        const href = a?.getAttribute?.("href") || "";
        const segments = href.split("/").filter(Boolean);
        if (segments.length !== 1) continue;
        const seg = segments[0];
        if (!seg || systemPaths.includes(seg.toLowerCase())) continue;
        if (/^\d{5,}$/.test(seg)) continue;
        const candidate = seg;
        const valid = isValidUsername(candidate);
        console.log("[RS] Strategy 1 (header anchor):", candidate, "→", valid ? "PASS" : "FAIL");
        if (valid) return valid;
      }
    }
  } catch (_e) {
    console.log("[RS] Strategy 1 (header anchor): error → FAIL");
  }

  try {
    const pathname = window.location?.pathname || "";
    const segments = pathname.split("/").filter(Boolean);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (!seg) continue;
      if (["direct", "t", "inbox"].includes(seg.toLowerCase())) continue;
      if (/^\d+$/.test(seg)) continue;
      const valid = isValidUsername(seg);
      console.log("[RS] Strategy 2 (URL):", seg, "→", valid ? "PASS" : "FAIL");
      if (valid) return valid;
    }
  } catch (_e) {
    console.log("[RS] Strategy 2 (URL): error → FAIL");
  }

  try {
    const raw = (typeof document.title === "string" ? document.title : "").replace(/^\(\d+\)\s*/, "");
    const titlePart = raw.split(" • ")[0]?.trim() || "";
    const valid = isValidUsername(titlePart);
    console.log("[RS] Strategy 3 (title):", titlePart, "→", valid ? "PASS" : "FAIL");
    if (valid) return valid;
  } catch (_e) {
    console.log("[RS] Strategy 3 (title): error → FAIL");
  }

  try {
    const mainEl = document.querySelector('[role="main"]');
    if (mainEl?.querySelectorAll) {
      const headings = Array.from(mainEl.querySelectorAll('h1, h2, h3, [role="heading"]'));
      for (let hi = 0; hi < headings.length; hi++) {
        const h = headings[hi];
        let rect = { left: 0 };
        try {
          rect = h.getBoundingClientRect?.() || rect;
        } catch (_e) {
          continue;
        }
        if (rect.left < 400) continue;
        const text = typeof h.innerText === "string" ? h.innerText.trim() : "";
        const valid = isValidUsername(text);
        console.log("[RS] Strategy 4 (heading):", text, "→", valid ? "PASS" : "FAIL");
        if (valid) return valid;
      }
    }
  } catch (_e) {
    console.log("[RS] Strategy 4 (heading): error → FAIL");
  }

  try {
    const mainL = document.querySelector('[role="main"]');
    if (mainL?.querySelectorAll) {
      const labeled = Array.from(mainL.querySelectorAll("[aria-label]"));
      for (let li = 0; li < labeled.length; li++) {
        const el = labeled[li];
        const label = el?.getAttribute?.("aria-label") || "";
        const match = label.match(/(?:conversation with|chat with|messaging with)\s+(.+)/i);
        if (match?.[1]) {
          const valid = isValidUsername(match[1].trim());
          console.log("[RS] Strategy 5 (aria-label):", match[1], "→", valid ? "PASS" : "FAIL");
          if (valid) return valid;
        }
      }
    }
  } catch (_e) {
    console.log("[RS] Strategy 5 (aria-label): error → FAIL");
  }

  console.log("[RS] Username strategies exhausted → unknown_buyer");
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

/**
 * Record order outcome from extension panel (same API as dashboard).
 * @param {string} buyerId
 * @param {string} outcome
 */
async function submitOutcomeFromPanel(buyerId, outcome) {
  const msgEl = document.getElementById("rs-outcome-msg");
  const authData = await getTokenFromBackground();
  const token = authData?.token;
  if (!token) {
    if (msgEl) msgEl.textContent = "Sign in required to save outcome.";
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/outcomes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ buyer_id: buyerId, outcome })
    });
    let payload = {};
    try {
      payload = await res.json();
    } catch (_e) {
      payload = {};
    }
    if (!res.ok) throw new Error(payload.error || "Request failed");
    if (msgEl) msgEl.textContent = "Saved. Thank you.";
    document.querySelectorAll(".rs-outcome-btn").forEach((b) => {
      b.setAttribute("disabled", "true");
    });
  } catch (e) {
    if (msgEl) msgEl.textContent = e instanceof Error ? e.message : "Could not save";
  }
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
      <div class="rs-header-logo">
        <img src="${RS_BRAND_LOGO}" width="28" height="28" alt="" class="rs-logo-img" />
        <span class="rs-header-title">ReturnSense</span>
      </div>
      <button type="button" class="rs-close-btn" id="rs-close-extract" aria-label="Close">&#x2715;</button>
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

  const phoneAutoClass = phoneDet ? "rs-auto-label detected" : "rs-auto-label";
  const addrAutoClass = addrDet ? "rs-auto-label detected" : "rs-auto-label";
  const phoneAutoText = phoneDet ? "Auto-detected" : "Not detected";
  const addrAutoText = addrDet ? "Auto-detected" : "Not detected";

  closePanel();
  applyInstagramMainMargin();

  const panel = document.createElement("div");
  panel.id = "rs-panel";
  panel.innerHTML = `
    <div id="rs-panel-header">
      <div class="rs-header-logo">
        <img src="${RS_BRAND_LOGO}" width="28" height="28" alt="" class="rs-logo-img" />
        <span class="rs-header-title">ReturnSense</span>
      </div>
      <button type="button" class="rs-close-btn" id="rs-close-panel" aria-label="Close">&#x2715;</button>
    </div>
    <div id="rs-panel-body">
      <div class="rs-card">
        <div class="rs-card-body">
          <div class="rs-buyer-line">Analyzing buyer: <strong>@${safeUser}</strong></div>
          <label style="display:block;font-weight:600;color:#262626;font-size:13px;">Phone Number</label>
          <input id="rs-phone" class="rs-input" type="text" value="${phoneVal}" autocomplete="off" />
          <div class="${phoneAutoClass}">${phoneAutoText}</div>
          <label style="display:block;margin-top:10px;font-weight:600;color:#262626;font-size:13px;">Delivery Address</label>
          <textarea id="rs-address" class="rs-input" rows="3">${addrEscaped}</textarea>
          <div class="${addrAutoClass}">${addrAutoText}</div>
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

function showLoginRequired() {
  const body = document.getElementById("rs-panel-body");
  if (!body) return;
  body.innerHTML = `
    <div class="rs-card">
      <div class="rs-card-body">
        <p class="rs-section-label" style="text-transform:none;letter-spacing:0;">Sign in required</p>
        <p style="font-size:13px;color:#737373;line-height:1.5;margin-bottom:12px;">
          Log in from the ReturnSense extension popup, or open the dashboard to create an account.
        </p>
        <a href="${API_BASE}/login" target="_blank" rel="noreferrer" class="rs-action-btn rs-btn-primary" style="display:block;text-align:center;text-decoration:none;">
          Open log in
        </a>
      </div>
    </div>`;
}

function getTokenFromBackground() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "RS_GET_SESSION" }, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ token: null, email: null, user: null });
        return;
      }
      const session = response?.session;
      const token = session?.access_token ?? response?.token ?? null;
      resolve({ token, email: response?.email ?? null, user: response?.user ?? null });
    });
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
    showLoginRequired();
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
function renderNetworkProfileBanner(result) {
  const np = result?.network_profile;
  if (!np || typeof np !== "object") {
    return "";
  }
  const sev = String(np.trust_severity || "neutral").toLowerCase();
  if (np.has_profile !== true) {
    return `<div class="rs-network-banner rs-network-neutral" role="region" aria-label="Cross-seller network profile">
      <div class="rs-network-eyebrow">Network profile</div>
      <div class="rs-network-title">No cross-seller history yet</div>
      <div class="rs-network-body">This Instagram handle has no marked outcomes from other ReturnSense sellers.</div>
    </div>`;
  }
  const ratio = `${np.delivered} delivered · ${np.returned} returned · ${np.fake} fake`;
  const sellers =
    typeof np.distinct_sellers === "number" && np.distinct_sellers > 0
      ? `${np.distinct_sellers} sellers contributed`
      : "";
  const scoreNet =
    typeof np.network_trust_score === "number" ? `Trust ${np.network_trust_score}/100` : "";
  const meta = [scoreNet, `${np.total_analyses} analyses`, sellers].filter(Boolean).join(" · ");
  const title = typeof np.trust_label === "string" ? np.trust_label : "Network history";
  return `<div class="rs-network-banner rs-network-${sev}" role="region" aria-label="Cross-seller network profile">
    <div class="rs-network-eyebrow">Network profile</div>
    <div class="rs-network-title">${escapeHtml(title)}</div>
    <div class="rs-network-stats">${escapeHtml(ratio)}</div>
    ${meta ? `<div class="rs-network-meta">${escapeHtml(meta)}</div>` : ""}
  </div>`;
}

/**
 * @param {Record<string, unknown>} result
 */
function renderConflictResolutionCard(result) {
  const raw = result?.signal_conflicts_resolved;
  if (!Array.isArray(raw) || raw.length === 0) return "";
  const items = raw
    .map((entry) => {
      if (entry && typeof entry === "object") {
        const rid = escapeHtml(String(entry.rule_id ?? ""));
        const res = escapeHtml(String(entry.resolution ?? ""));
        const fav = entry.favored ? escapeHtml(String(entry.favored)) : "";
        return `<div class="rs-conflict-item"><span class="rs-conflict-rule">${rid}</span><p class="rs-conflict-text">${res}</p>${fav ? `<span class="rs-conflict-favor">Favored: ${fav}</span>` : ""}</div>`;
      }
      return `<div class="rs-conflict-item"><p class="rs-conflict-text">${escapeHtml(String(entry))}</p></div>`;
    })
    .join("");
  return `<div class="rs-card">
    <div class="rs-card-header">Signal conflict resolution</div>
    <div class="rs-card-body rs-conflict-list">${items}</div>
  </div>`;
}

/**
 * @param {Record<string, unknown>} result
 */
function displayResult(result) {
  const body = document.getElementById("rs-panel-body");
  if (!body) return;

  const networkBannerHtml = renderNetworkProfileBanner(result);
  const conflictCardHtml = renderConflictResolutionCard(result);

  const scoreRaw = result?.trust_score;
  const score = typeof scoreRaw === "number" && !Number.isNaN(scoreRaw) ? scoreRaw : 0;
  const riskColor =
    score >= 75 ? "#1D9A0B" : score >= 55 ? "#D4A017" : score >= 35 ? "#E8490F" : "#ED4956";

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

  const convSummary =
    typeof result?.conversation_summary === "string" && result.conversation_summary
      ? result.conversation_summary
      : "";
  const summaryHtml = convSummary
    ? `<div style="font-size:11px;color:#737373;text-align:center;padding:4px 10px 10px;border-top:1px solid #EFEFEF;margin-top:6px;">${escapeHtml(
        convSummary
      )}</div>`
    : "";
  const msgCount =
    typeof result?.message_count === "number" && !Number.isNaN(result.message_count) ? result.message_count : 0;
  const msgCountHtml = `<div class="rs-msg-count">Analyzed ${msgCount} message${
    msgCount === 1 ? "" : "s"
  } from conversation</div>`;

  const quickFacts = [];
  if (result?.commitment_confirmed === true)
    quickFacts.push(`<span class="rs-quick-fact positive">Order confirmed</span>`);
  if (result?.shared_phone_proactively === true)
    quickFacts.push(`<span class="rs-quick-fact positive">Phone shared proactively</span>`);
  if (result?.shared_address_proactively === true)
    quickFacts.push(`<span class="rs-quick-fact positive">Address shared proactively</span>`);
  if (result?.hesitation_detected === true)
    quickFacts.push(`<span class="rs-quick-fact negative">Hesitation detected</span>`);
  if (result?.asked_about_returns === true)
    quickFacts.push(`<span class="rs-quick-fact negative">Asked about returns</span>`);
  if (result?.excessive_bargaining === true)
    quickFacts.push(`<span class="rs-quick-fact negative">Excessive bargaining</span>`);
  const quickFactsHtml =
    quickFacts.length > 0
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid #EFEFEF;">${quickFacts.join(
          ""
        )}</div>`
      : "";

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
      ? `<span class="rs-status-valid">Valid — Active</span>`
      : `<span class="rs-status-invalid">Invalid</span>`;
    const carrierTrim = typeof phone.phone_carrier === "string" ? phone.phone_carrier.trim() : "";
    const countryTrim = typeof phone.phone_country === "string" ? phone.phone_country.trim() : "";
    const typeTrim = typeof phone.phone_type === "string" ? phone.phone_type.trim() : "";
    const typeParts = [];
    if (typeTrim) typeParts.push(escapeHtml(typeTrim));
    if (phone.phone_is_voip) typeParts.push(`<span class="rs-status-warning">VoIP</span>`);
    const typeRow =
      typeParts.length > 0
        ? `<div class="rs-row"><span class="rs-row-label">Type</span><span class="rs-row-value">${typeParts.join(
            " "
          )}</span></div>`
        : "";
    const carrierRow = carrierTrim
      ? `<div class="rs-row"><span class="rs-row-label">Carrier</span><span class="rs-row-value">${escapeHtml(
          carrierTrim
        )}</span></div>`
      : "";
    const countryRow = countryTrim
      ? `<div class="rs-row"><span class="rs-row-label">Country</span><span class="rs-row-value">${escapeHtml(
          countryTrim
        )}</span></div>`
      : "";
    phoneBlock = `
      <div class="rs-row"><span class="rs-row-label">Number</span><span class="rs-row-value">${numDisp || "—"}</span></div>
      <div class="rs-row"><span class="rs-row-label">Status</span><span class="rs-row-value">${statusHtml}</span></div>
      ${typeRow}${carrierRow}${countryRow}
      ${phone.phone_is_voip ? `<div class="rs-voip-warning">HIGH RISK — VoIP numbers are commonly used for fake orders. Consider requesting an alternate contact.</div>` : ""}`;
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
    const barColor = q > 70 ? "#1D9A0B" : q > 40 ? "#D4A017" : "#ED4956";
    const prec = String(address.address_precision ?? "");
    let precLabel = "Approximate street";
    if (prec === "ROOFTOP") precLabel = "Exact location";
    else if (prec === "APPROXIMATE") precLabel = "Area only — imprecise";
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
      ? pos.map((s) => `<span class="rs-badge-positive">${escapeHtml(String(s))}</span>`).join("")
      : `<span style="color:#8E8E8E;font-size:12px;">None detected</span>`;
  const negHtml =
    neg.length > 0
      ? neg.map((s) => `<span class="rs-badge-negative">${escapeHtml(String(s))}</span>`).join("")
      : `<span style="color:#8E8E8E;font-size:12px;">None detected</span>`;

  const ser = escapeHtml(String(result?.buyer_seriousness ?? "—"));
  const committed = result?.commitment_confirmed === true;
  const commQ = escapeHtml(String(result?.communication_quality ?? "—"));
  const reasons = Array.isArray(result?.ai_reasons) ? result.ai_reasons : [];
  const reasonsHtml = reasons
    .map((r) => `<div class="rs-reason-item">${escapeHtml(String(r))}</div>`)
    .join("");

  const recRaw = String(result?.recommendation ?? "caution").toLowerCase();
  let recColor = "#D4A017";
  let recText = "USE CAUTION";
  if (recRaw === "proceed") {
    recColor = "#1D9A0B";
    recText = "PROCEED WITH ORDER";
  } else if (recRaw === "hold") {
    recColor = "#E8490F";
    recText = "HOLD ORDER";
  } else if (recRaw === "reject") {
    recColor = "#ED4956";
    recText = "REJECT ORDER";
  }
  const recBg = `${recColor}26`;

  const hist = Array.isArray(result?.historical_data) ? result.historical_data : [];
  let histHtml = "";
  if (!hist.length) {
    histHtml = `<p style="font-size:13px;color:#6B7280;margin:0;">No prior marked outcomes found for this buyer in your account history.</p>`;
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
  const bidForOutcome = result?.buyer_id;
  const outcomeCard =
    bidForOutcome != null && String(bidForOutcome).length > 0
      ? `<div class="rs-card">
      <div class="rs-card-header">Order outcome</div>
      <div class="rs-card-body">
        <p style="font-size:12px;color:#6B7280;margin:0 0 10px;line-height:1.4;">What happened with this order? (Improves future scoring; cross-seller data uses hashed handles only.)</p>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <button type="button" class="rs-outcome-btn" data-outcome="delivered">Delivered</button>
          <button type="button" class="rs-outcome-btn" data-outcome="returned">Returned</button>
          <button type="button" class="rs-outcome-btn" data-outcome="fake">Fake order</button>
          <button type="button" class="rs-outcome-btn" data-outcome="cancelled">Cancelled</button>
        </div>
        <p id="rs-outcome-msg" style="font-size:12px;margin-top:10px;color:#374151;min-height:1.2em;"></p>
      </div>
    </div>`
      : "";
  const privacyFooter = `<div style="font-size:10px;color:#9CA3AF;text-align:center;padding:10px 4px 2px;line-height:1.45;border-top:1px solid #EFEFEF;margin-top:10px;">Conversation text is not stored. Only derived risk signals. Scores are advisory—you decide whether to ship. <a href="${API_BASE}/privacy" target="_blank" rel="noopener noreferrer" style="color:#6B7280;">Privacy policy</a></div>`;

  body.innerHTML = `
    ${networkBannerHtml}
    <div class="rs-card">
      <div class="rs-card-body">
        <div class="rs-score-wrap">
          <div class="rs-score-number" style="color:${riskColor}">${score}</div>
          <span class="rs-risk-badge" style="background:${riskColor};color:#fff;">${riskLabel}</span>
          <div class="rs-analyst-notes">${escapeHtml(analystNotes)}</div>
          ${summaryHtml}
          ${msgCountHtml}
        </div>
      </div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">Phone Analysis</div>
      <div class="rs-card-body">${phoneBlock}</div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">Address Analysis</div>
      <div class="rs-card-body">${addressBlock}</div>
    </div>

    ${conflictCardHtml}
    <div class="rs-card">
      <div class="rs-card-header">AI Behavioral Analysis</div>
      <div class="rs-card-body">
        ${quickFactsHtml}
        <div class="rs-signals-grid">
          <div>
            <div class="rs-signals-col-title">Positive</div>
            <div>${posHtml}</div>
          </div>
          <div>
            <div class="rs-signals-col-title">Risks</div>
            <div>${negHtml}</div>
          </div>
        </div>
        <div class="rs-stats-row">
          <span>Seriousness: ${ser}</span><span>·</span>
          <span>Committed: ${committed ? "Confirmed" : "Not confirmed"}</span><span>·</span>
          <span>Communication: ${commQ}</span>
        </div>
        ${reasonsHtml}
        <div class="rs-recommendation" style="background:${recBg};color:${recColor};border-color:${recColor};">${recText}</div>
      </div>
    </div>

    <div class="rs-card">
      <div class="rs-card-header">Buyer History</div>
      <div class="rs-card-body">${histHtml}</div>
    </div>

    ${outcomeCard}

    <div class="rs-card">
      <div class="rs-card-body">
        <button type="button" class="rs-action-btn rs-btn-primary" id="rs-view-report">View full report</button>
        <button type="button" class="rs-action-btn rs-btn-secondary" id="rs-new-analysis">New analysis</button>
        <div style="text-align:center;color:#8E8E8E;font-size:11px;margin-top:4px;">Analysis ID: ${buyerIdDisp} · ReturnSense</div>
        ${privacyFooter}
      </div>
    </div>`;

  const viewBtn = document.getElementById("rs-view-report");
  if (viewBtn) {
    viewBtn.addEventListener("click", () => {
      const fromApi = result?.dashboard_url;
      let u =
        typeof fromApi === "string" && /^https?:\/\//i.test(fromApi.trim()) ? fromApi.trim() : null;
      const bid = result?.buyer_id;
      if (!u && bid != null && bid !== "") {
        u = `${API_BASE}/dashboard/buyers/${encodeURIComponent(String(bid))}`;
      }
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

  document.querySelectorAll(".rs-outcome-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const o = btn.getAttribute("data-outcome");
      if (o && bidForOutcome != null) void submitOutcomeFromPanel(String(bidForOutcome), o);
    });
  });
}

function removeFloatingAnalyzeButton() {
  document.getElementById("rs-analyze-fab")?.remove();
}

function ensureFloatingAnalyzeButton() {
  if (document.getElementById("rs-analyze-btn") || document.getElementById("rs-analyze-fab")) return;
  const fab = document.createElement("button");
  fab.id = "rs-analyze-fab";
  fab.type = "button";
  fab.className = "rs-analyze-btn rs-fab";
  fab.textContent = "Analyze";
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
    btn.textContent = "Analyze Buyer";
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
