# Devpost submission copy

Update the bracketed video URL after publishing. Do not claim an Amazon account, Alexa+ device, or private-preview SDK integration.

## Project name

Deadline Rescue — EDITH

## One-line summary

A local-first deadline recovery assistant with a self-hosted MCP server and browser-based Alexa+ simulator.

## Project description

Deadlines rarely fail because someone did not make a list. They fail when priorities collide, an interruption wipes out a block of time, and it is no longer obvious what to do next. Deadline Rescue turns a persistent task list into an actionable recovery plan: it identifies deadline risk, fits work into an available window, and rebuilds the plan after lost time.

EDITH is the conversational layer over that real local data. It can create and manage tasks through validated application functions, preserve explicit memory and conversation history, and expose the same task, reminder, planning, recovery, and risk capabilities through a self-hosted Streamable HTTP MCP server. The browser includes a working MCP simulator that performs the live handshake and tool calls against the running server.

Privacy is a product choice. Tasks, reminders, memories, conversation records, and recovery history stay in a local SQLite database. The optional Groq integration sends only the current message when a hosted answer is needed; it does not send the database, memories, task list, action history, or private files.

## Track and mini challenge

- **Primary track:** Alexa+
- **Why it qualifies:** the project runs a self-hosted Streamable HTTP MCP endpoint at `POST /mcp`, supports MCP protocol `2025-11-25`, and demonstrates a live initialize → tool discovery → tool call flow.
- **Optional mini challenge:** Open Source — select only after the exact submitted revision is pushed to a public repository during the event window.

## Alexa+ implementation disclosure

This submission uses a self-hosted MCP server and an in-repository browser simulation. It does **not** use a consumer Alexa+ device, an Alexa+ service connection, or invite-only Alexa+ add-on development tools. The source code for both the server and simulation is included in the repository.

## Built with

Python, FastAPI, Pydantic, SQLite, React, Vite, Model Context Protocol Streamable HTTP, and optional Groq API/SDK.

## Significant updates during the submission window

See [SIGNIFICANT-UPDATE.md](SIGNIFICANT-UPDATE.md) for the concise before-and-after statement and evidence.

## Demo video

Public English YouTube/Vimeo URL: **[add URL after upload]**

The recording follows [DEMO-SCRIPT.md](../DEMO-SCRIPT.md) and is timed for 2 minutes 30 seconds.

## Evidence for reviewers

- [Local setup and privacy boundaries](../README.md)
- [Fastest working evaluation flow](../JUDGE_QUICKSTART.md)
- [MCP transport behavior](MCP-COMPLIANCE.md)
- [Product feedback](PRODUCT-FEEDBACK.md)
- [Genuine friction log policy](../FRICTION.md)
