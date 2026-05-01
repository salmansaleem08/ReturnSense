window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.type === "RETURNSENSE_EXT_PING") {
    chrome.runtime.sendMessage({ type: "PING" }, () => {
      // Keep this callback explicit for future telemetry and error handling.
    });
  }
});
