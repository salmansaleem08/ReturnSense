const API_BASE = "https://your-vercel-app.vercel.app";

if (!window.location.href.includes("/direct/")) {
  // Guard: extension logic only runs on Instagram DMs.
} else {
  let observerStarted = false;
  let pendingDebounce = null;

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

  function extractChatFallback() {
    const main = document.querySelector("[role='main']");
    if (!main) return [];
    const rawText = main.innerText;
    return [{ role: "unknown", text: rawText, timestamp: null }];
  }

  function extractChatMessages() {
    const messageNodes = queryAllWithFallbacks([
      "[role='listitem']",
      "[data-testid*='message']",
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

    if (!messages.length) {
      return extractChatFallback();
    }

    return messages;
  }

  function extractBuyerUsername() {
    const header = queryWithFallbacks([
      "[role='main'] header",
      "[data-testid*='thread'] header",
      "div[class*='x1n2onr6'] header"
    ]);

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

  function tryInjectButton() {
    if (document.getElementById("rs-analyze-btn")) return;
    const header = queryWithFallbacks([
      "[role='main'] header",
      "[data-testid*='thread'] header",
      "div[class*='x1n2onr6'] header"
    ]);
    if (!header) return;

    const btn = document.createElement("button");
    btn.id = "rs-analyze-btn";
    btn.className = "rs-btn";
    btn.textContent = "🛡 Analyze Buyer";
    btn.addEventListener("click", openAnalysisPanel);
    header.appendChild(btn);
  }

  function tryDetectChat() {
    extractBuyerUsername();
  }

  function startObserver() {
    if (observerStarted) return;
    observerStarted = true;
    const observer = new MutationObserver(() => {
      if (pendingDebounce) window.clearTimeout(pendingDebounce);
      pendingDebounce = window.setTimeout(() => {
        tryInjectButton();
        tryDetectChat();
      }, 100);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    tryInjectButton();
  }

  startObserver();
}

