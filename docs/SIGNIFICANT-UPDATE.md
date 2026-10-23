# Significant update statement

Deadline Rescue existed as a task-planning concept before this event. During the submission window it was substantially extended into EDITH: a persistent, conversational, local-first productivity assistant with a demonstrable self-hosted MCP surface.

## What changed

- Added persistent assistant conversations, explicit memory, action history, recovery history, and reminder delivery state to the local SQLite model.
- Added a browser-based Alexa+ simulation that performs a live MCP initialize, discovery, and tool-call flow against the running project server.
- Consolidated ten MCP tools into canonical validated schemas shared by the server and the optional Groq tool interface. Invalid and undeclared tool arguments are rejected.
- Implemented Streamable HTTP transport behavior for MCP protocol `2025-11-25`, including content negotiation, protocol-header checks, stateless reconnect behavior, and transport regression coverage.
- Added resilient scheduling improvements: overdue-risk reporting, duplicate task protection, persistent recovery events, and reminder rescheduling safeguards.
- Added production hardening: exact-origin CORS, fail-closed server-side bearer authorization, request-size limits, rate limits, browser security headers, safe configuration templates, and security regression tests.

## How to see the before-and-after value

The demo starts with a real task, turns it into a focus plan, simulates a disruption, and then shows the same task data through the live MCP interface. That progression is a new working conversational/MCP capability, not a cosmetic rename. See [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) and [JUDGE_QUICKSTART.md](../JUDGE_QUICKSTART.md).
