# Deadline Rescue — EDITH

Deadline Rescue is a local-first task, planning, and recovery assistant. It helps a person see deadline risk, build a focus plan, recover after lost time, and use the same real task data through a self-hosted MCP server.

Built for the **Build, Ship, Shape Amazon Developer Hackathon 2026 — Alexa+ track** and the **Open Source mini challenge**.

> **Alexa+ scope:** this is a self-hosted Streamable HTTP MCP server plus a browser-based simulator. It is not connected to a consumer Alexa+ device, service, private-preview SDK, or Amazon account.

## What works

- Persistent tasks with priorities, deadlines, projects, status changes, and duplicate protection
- Deadline-risk analysis, focus planning, disruption recovery, and recovery history
- EDITH assistant chat, explicit saved memory, action history, and optional Groq responses
- Persistent reminders and an in-browser MCP simulator
- Ten validated MCP tools over `POST /mcp`, using protocol `2025-11-25`
- A phone-installable web app shell with an honest offline fallback page

## Judge quickstart

Requirements: Python 3.11+ and Node.js 20+.

```bash
# Terminal 1 — backend
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 5050
```

```bash
# Terminal 2 — frontend
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. The first start creates a local SQLite database at `backend/deadline_rescue.db`; it stays local and is ignored by Git. No API key is required to test tasks, plans, recovery, reminders, or MCP. The hosted-chat fallback explains when `GROQ_API_KEY` is not configured.

For a concise evaluation flow, including a real protocol client, see [JUDGE_QUICKSTART.md](JUDGE_QUICKSTART.md).

## Deployment security

The local demo allows unauthenticated requests from the two local Vite origins so it can be run immediately. Public deployments must set `APP_ENV=production` and a long, server-held `DEADLINE_RESCUE_API_TOKEN`; otherwise `/api/*` and `/mcp` fail closed with `503`. A separate `DEADLINE_RESCUE_MCP_TOKEN` can be used for MCP clients.

Send the token as `Authorization: Bearer <token>` from a trusted service or an authenticated reverse proxy. Do **not** put either token in `VITE_*`, source code, a browser bundle, or a public client: that would not be real authentication. This demo uses app-level authorization, not per-user accounts; a multi-user public release still needs an identity-aware gateway or backend session layer to keep each user's data separate.

Set `CORS_ALLOWED_ORIGINS` and `MCP_ALLOWED_ORIGINS` to the exact deployed frontend origin(s), comma-separated. Wildcard origins are ignored. The backend also applies no-store and standard browser security headers, rejects oversized bodies, and has conservative in-process API/MCP rate limits. Configure equivalent rate limiting and HTTPS at the hosting gateway when using multiple workers. See [`backend/.env.example`](backend/.env.example) for safe variable names and defaults.

The included [private-preview deployment](docs/DEPLOYMENT.md) serves the frontend and API at the same origin, keeps the server token out of the browser bundle, and protects the preview with HTTP basic authentication. It is deliberately **not** a public multi-user release: the current SQLite database is single-user and needs identity-aware tenancy before it can safely be opened to multiple users.

## Tests (from repository root)
```bash
backend/.venv/bin/pytest -q
cd frontend && npm test && npm run build
```

## Submission evidence

- [Judge quickstart](JUDGE_QUICKSTART.md)
- [Submission copy and track evidence](docs/SUBMISSION.md)
- [Significant-update statement](docs/SIGNIFICANT-UPDATE.md)
- [Product feedback](docs/PRODUCT-FEEDBACK.md)
- [Demo script](DEMO-SCRIPT.md)
- [MCP transport verification](docs/MCP-COMPLIANCE.md)
- [Submission checklist](SUBMISSION-CHECKLIST.md)

## Privacy and data handling

Task, memory, conversation, reminder, and recovery records are stored only in the local SQLite database. `GROQ_API_KEY`, if configured, stays server-side in the ignored `backend/.env` file. The assistant sends the current chat message to Groq only when it needs a hosted response; task lists, memories, database contents, action history, and private files are not sent to Groq. Application actions run through validated local functions and MCP tool schemas.
