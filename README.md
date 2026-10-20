# Deadline Rescue — EDITH

Deadline Rescue is a task-aware planning and recovery assistant evolving toward a voice-first personal AI assistant.

## Features
- Task creation, updates, and deletion
- Scheduling and deadline-risk analysis
- Recovery planning and history
- Assistant chat, saved memory, and action history
- Self-hosted MCP endpoint at /mcp

## Status
Alexa+ is demonstrated through a self-hosted MCP integration and browser simulation. This project does not claim live Alexa+ service integration.

## Run backend
```bash
cd backend
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 5050
```

## Run frontend (separate terminal)
```bash
cd frontend
npm ci
npm run dev
```

## Tests (from repository root)
```bash
backend/.venv/bin/pytest -q
cd frontend && npm test && npm run build
```

See DEMO-SCRIPT.md, SUBMISSION-CHECKLIST.md, and docs/MCP-COMPLIANCE.md before submission.
