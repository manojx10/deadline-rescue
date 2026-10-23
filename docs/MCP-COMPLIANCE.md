# MCP transport verification

Deadline Rescue implements a stateless Streamable HTTP MCP endpoint at `POST /mcp` and exposes ten tools. The server does not offer a server-initiated SSE stream; `GET /mcp` therefore returns `405 Method Not Allowed` with `Allow: POST`.

## Verified behavior

- `initialize` returns protocol version `2025-11-25` and JSON content.
- `tools/list` exposes the registered tools.
- Notifications return `202 Accepted` with an empty body.
- Wrong content types return `415`; unacceptable `Accept` headers return `406`.
- Untrusted browser origins are rejected with `403`.
- The endpoint is stateless and does not issue `MCP-Session-Id`; a session ID is optional for this mode.
- After initialization, requests must include `MCP-Protocol-Version: 2025-11-25`.
- In production, MCP fails closed unless a server-side bearer token is configured. Use `DEADLINE_RESCUE_MCP_TOKEN` (or the fallback `DEADLINE_RESCUE_API_TOKEN`) and send it in `Authorization: Bearer <token>`.
- Browser origins are configured with exact values in `MCP_ALLOWED_ORIGINS`; wildcard origins are ignored. Do not expose an MCP bearer token in browser code.

## Remaining release gate

Run `cd backend && .venv/bin/pytest -q`. Before claiming full MCP compliance in the submission, also test with an independent MCP client that supports protocol version `2025-11-25`, and verify its initialization, authenticated tool calls, and reconnect behavior. This project is a self-hosted MCP integration and browser simulation; it is **not** a live connection to a consumer Alexa+ device/service.
