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

function queryWithFallbacks(selectors) {
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) return el;
    } catch (_error) {
      // Ignore invalid selectors and continue fallback scan.
    }
  }
  return null;
}

function queryAllWithFallbacks(selectors) {
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
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
function extractChatFallback() {
  const main = document.querySelector("[role='main']");
  if (!main) return [];
  const rawText = (main.innerText || "").trim();
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

function extractChatMessages() {
  const messageNodes = queryAllWithFallbacks([
    "[role='listitem']",
    "[role='row']",
    "[data-testid*='message']",
    "div[role='row']",
    "[class*='messageList'] [role='presentation']",
    "[class*='message']"
  ]);

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

  if (messages.length < 2) {
    const fallback = extractChatFallback();
    if (fallback.length >= 2) return fallback;
  }

  if (!messages.length) {
    return extractChatFallback();
  }

  return messages;
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
  const header = findChatHeaderToolbar();

  if (!header) return null;

  const link = header.querySelector("a[href*='instagram.com']");
  if (link?.href) {
    const match = link.href.match(/instagram\.com\/([^/?#]+)/);
    if (match) return match[1];
  }

  const ariaTarget = header.querySelector("[aria-label]");
  if (ariaTarget?.getAttribute("aria-label")) {
    const label = ariaTarget.getAttribute("aria-label");
    const fromAt = label.match(/@([A-Za-z0-9._]+)/);
    if (fromAt) return fromAt[1];
  }

  const span = header.querySelector("span[dir], span");
  return span?.innerText?.replace("@", "").trim() || null;
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

function openAnalysisPanel() {
  const messages = extractChatMessages();
  const username = extractBuyerUsername();
  renderPanelBase(username);
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
      body: JSON.stringify({ messages, username, phone, address })
    });

    const result = await res.json();
    if (!res.ok) {
      throw new Error(result?.error || "Analysis failed");
    }
    displayResult(result);
  } catch (error) {
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
  const phone = result.phone_analysis || {};
  const address = result.address_analysis || {};
  const quality = address.address_quality_score || 0;

  panel.innerHTML = `
      <button class="rs-close" id="rs-close-panel">×</button>
      <div class="rs-panel-inner">
        <div class="rs-score-circle" style="border-color:${color};color:${color};">${score}</div>
        <div class="rs-risk-badge" style="background:${color};">${result.risk_level.toUpperCase()} RISK</div>

        <div class="rs-section">
          <strong>Phone Analysis</strong>
          <span>${phone.phone_valid ? "✅ Valid" : "❌ Invalid"}</span>
          <span>${phone.phone_carrier || "Carrier unavailable"}</span>
          <span>${phone.phone_type || ""}</span>
          ${phone.phone_is_voip ? '<span class="rs-signal-negative">VoIP Warning</span>' : ""}
        </div>

        <div class="rs-section">
          <strong>Address Analysis</strong>
          <span>${address.address_formatted || "Address not found"}</span>
          <span>Quality: ${quality}/100</span>
          <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
            <div style="height:100%;width:${quality}%;background:${quality > 60 ? "#16a34a" : quality > 35 ? "#ea580c" : "#dc2626"};"></div>
          </div>
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
