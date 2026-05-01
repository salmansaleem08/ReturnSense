# ReturnSense Chrome Extension

## Load Unpacked Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `extension/` folder from this repository.

## Configure API URL

1. Open `extension/content.js`.
2. Update:
   - `const API_BASE = 'https://your-vercel-app.vercel.app';`
3. Replace it with your live dashboard domain.

## Get Extension Token

1. Log in to ReturnSense dashboard.
2. Open **Dashboard -> Settings**.
3. Click **Generate Extension Token**.
4. Copy the token.

## Save Token in Popup

1. Click the ReturnSense extension icon in Chrome.
2. Paste token in the token input.
3. (Optional) add seller email.
4. Click **Save Token**.
5. Confirm popup shows **Connected ✓**.
