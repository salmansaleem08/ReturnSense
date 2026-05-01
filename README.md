# ReturnSense

Production-first monorepo scaffold for:

- `apps/web`: Next.js web platform (Vercel-ready).
- `services/api`: FastAPI backend service (Render-ready).
- `extensions/chrome-extension`: isolated Chrome Extension codebase for manual local loading.

## Repository Structure

```text
ReturnSense/
  apps/
    web/
  services/
    api/
  extensions/
    chrome-extension/
  packages/
    ui/
```

## Quick Start

### 1) Install dependencies

```bash
npm install
```

### 2) Run web app

```bash
npm run dev:web
```

### 3) Run API service

```bash
python3 -m venv services/api/.venv
source services/api/.venv/bin/activate
pip install -r services/api/requirements-dev.txt
uvicorn app.main:app --app-dir services/api --reload --port 8000
```

## Deployment Notes

- **Web (`apps/web`)**: deploy to Vercel using `apps/web` as the project root directory.
- **API (`services/api`)**: deploy via Render Blueprint (`render.yaml`) or manual Render service setup.
- **Chrome Extension**: for now use manual load in Chrome (`chrome://extensions` -> Developer Mode -> Load unpacked -> `extensions/chrome-extension`).

## Environment Setup

- Copy `apps/web/.env.example` -> `apps/web/.env.local`.
- Copy `services/api/.env.example` -> `services/api/.env`.
- Never commit secret keys.

## Engineering Baseline

- Modular domain structure with clear app boundaries.
- Shared UI package scaffold for scaling design system usage.
- Health endpoints and structured logging baseline.
- Caching-ready service architecture prepared for API cost optimization.
