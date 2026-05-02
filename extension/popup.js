/* global RS_POPUP_CONFIG */

const cfg = typeof window !== "undefined" && window.RS_POPUP_CONFIG ? window.RS_POPUP_CONFIG : {};
const SUPABASE_URL = cfg.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = cfg.SUPABASE_ANON_KEY || "";
const APP_URL = cfg.APP_URL || "https://return-sense-web.vercel.app";

document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ type: "RS_GET_SESSION" }, (result) => {
    if (chrome.runtime.lastError) {
      showLoginForm();
      return;
    }
    if (result?.session?.access_token) {
      showLoggedIn(result.user);
    } else {
      showLoginForm();
    }
  });
});

function showLoginForm() {
  const root = document.getElementById("popup-body");
  if (!root) return;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    root.innerHTML = `
      <p class="config-hint">Configure <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> in <code>extension/popup-config.js</code> (copy from apps/web <code>.env.local</code>).</p>
      <p class="status" style="margin-top:12px;">
        <a href="${APP_URL}/login" target="_blank" rel="noreferrer" class="link">Open dashboard login</a>
      </p>
    `;
    return;
  }

  root.innerHTML = `
    <input type="email" id="email" class="input" placeholder="Email address" autocomplete="email">
    <input type="password" id="password" class="input" placeholder="Password" autocomplete="current-password">
    <button id="login-btn" class="btn-primary">Log in</button>
    <div id="error-msg" class="error"></div>
    <p class="status" style="margin-top:16px;">
      No account? <a href="${APP_URL}/signup" target="_blank" rel="noreferrer" class="link">Sign up</a>
    </p>
  `;

  document.getElementById("login-btn").addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const btn = document.getElementById("login-btn");
    const errEl = document.getElementById("error-msg");

    if (!email || !password) {
      errEl.textContent = "Enter email and password.";
      return;
    }

    btn.disabled = true;
    btn.textContent = "Logging in...";
    errEl.textContent = "";

    chrome.runtime.sendMessage(
      {
        type: "RS_SUPABASE_PASSWORD_LOGIN",
        supabaseUrl: SUPABASE_URL,
        anonKey: SUPABASE_ANON_KEY,
        email,
        password
      },
      (response) => {
        if (chrome.runtime.lastError) {
          errEl.textContent = chrome.runtime.lastError.message || "Extension messaging failed.";
          btn.disabled = false;
          btn.textContent = "Log in";
          return;
        }

        if (!response?.ok) {
          const d = response?.data;
          errEl.textContent =
            d?.error_description ||
            d?.msg ||
            d?.message ||
            d?.error ||
            response?.error ||
            (response?.bodyPreview ? `Server error (${response?.status}).` : null) ||
            "Login failed.";
          btn.disabled = false;
          btn.textContent = "Log in";
          return;
        }

        const data = response.data;
        const user = {
          email: data.user?.email,
          id: data.user?.id,
          username: data.user?.user_metadata?.username
        };
        chrome.runtime.sendMessage({ type: "RS_LOGIN", session: data, user }, () => {
          showLoggedIn(user);
        });
      }
    );
  });
}

function showLoggedIn(user) {
  const root = document.getElementById("popup-body");
  if (!root) return;

  root.innerHTML = `
    <div class="user-info">
      <div class="username">${escapeHtml(user?.username || user?.email?.split("@")[0] || "User")}</div>
      <div class="email">${escapeHtml(user?.email || "")}</div>
    </div>
    <p class="status">Extension is active on Instagram.</p>
    <a href="${APP_URL}/dashboard" target="_blank" rel="noreferrer" class="btn-primary" style="display:block;text-align:center;margin-top:12px;text-decoration:none;">
      Open Dashboard
    </a>
    <button id="logout-btn" class="btn-secondary">Sign out</button>
  `;

  document.getElementById("logout-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "RS_LOGOUT" }, () => showLoginForm());
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
