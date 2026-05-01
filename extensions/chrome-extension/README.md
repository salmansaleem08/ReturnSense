# ReturnSense Chrome Extension

This extension is intentionally isolated from the web and API stacks.

## Local Load

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked**.
4. Select `extensions/chrome-extension`.

## Notes

- Keep extension-specific env/config separate from web and backend services.
- Avoid importing backend internals into extension code.
