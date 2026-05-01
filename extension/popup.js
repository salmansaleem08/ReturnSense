const root = document.getElementById("popup-root");

function getStored(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function setStored(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

function removeStored(keys) {
  return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
}

function setMessage(message, tone = "info") {
  const color = tone === "error" ? "#b91c1c" : tone === "success" ? "#166534" : "#334155";
  const msg = document.createElement("p");
  msg.textContent = message;
  msg.style.margin = "0";
  msg.style.fontSize = "12px";
  msg.style.color = color;
  root.appendChild(msg);
}

function renderDisconnected() {
  root.innerHTML = `
    <div class="rs-popup-card">
      <p class="rs-popup-help">Paste your extension token from dashboard settings to connect this browser.</p>
      <input id="rs-token-input" class="rs-popup-input" placeholder="Paste access token" />
      <input id="rs-email-input" class="rs-popup-input" placeholder="Seller email (optional)" />
      <button id="rs-save-token" class="rs-popup-button rs-popup-button-primary">Save Token</button>
    </div>
  `;

  document.getElementById("rs-save-token").addEventListener("click", async () => {
    const token = document.getElementById("rs-token-input").value.trim();
    const email = document.getElementById("rs-email-input").value.trim();
    if (!token) {
      setMessage("Token is required.", "error");
      return;
    }
    await setStored({ rs_auth_token: token, rs_seller_email: email || "Seller" });
    await initializePopup();
    setMessage("Token saved successfully.", "success");
  });
}

function renderConnected(email) {
  root.innerHTML = `
    <div class="rs-popup-card">
      <p class="rs-connected">Connected ✓</p>
      <p class="rs-popup-help">Seller: ${email || "Seller"}</p>
      <button id="rs-clear-token" class="rs-popup-button rs-popup-button-danger">Clear Token</button>
    </div>
  `;

  document.getElementById("rs-clear-token").addEventListener("click", async () => {
    await removeStored(["rs_auth_token", "rs_seller_email"]);
    await initializePopup();
    setMessage("Token cleared.", "success");
  });
}

async function initializePopup() {
  root.innerHTML = "";
  const { rs_auth_token: token, rs_seller_email: email } = await getStored(["rs_auth_token", "rs_seller_email"]);
  if (token) {
    renderConnected(email);
  } else {
    renderDisconnected();
  }
}

initializePopup();
