chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ initializedAt: Date.now() });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true, source: "background" });
  }
});
