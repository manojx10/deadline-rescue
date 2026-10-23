# Product feedback

This is ready to paste into the hackathon form. It covers the tools, APIs, and SDKs actually used by this repository. It deliberately does not claim use of invite-only Alexa+ add-on tooling.

## Model Context Protocol — Streamable HTTP

**What we used it for:** A self-hosted MCP endpoint exposing ten validated task, reminder, planning, recovery, and deadline-risk tools to the browser simulator and external MCP clients.

**What worked well:** The initialize/discovery/tool-call model made the integration easy to demonstrate and encouraged a clear tool contract. Stateless HTTP is a good fit for local persistent data because the client can reconnect without an application session.

**What could improve:** A compact official conformance fixture for Streamable HTTP, including expected behavior for notifications, accepted media types, and protocol-version transitions, would make interoperability checks faster for small self-hosted servers.

**Onboarding and reuse:** The protocol is approachable once its HTTP negotiation details are understood. We would use it again because it keeps model-facing actions explicit and testable.

## FastAPI and Pydantic

**What we used them for:** The Python API, input validation, strict request models, and the MCP schema boundary.

**What worked well:** Typed request models and dependency-light HTTP routing made it straightforward to keep application APIs and MCP inputs aligned. Rejecting undeclared fields reduced accidental state changes.

**What could improve:** Examples that pair strict Pydantic schemas with MCP tool schemas would help new developers avoid writing two drifting contracts.

**Onboarding and reuse:** FastAPI and Pydantic were quick to adopt for this type of local service. We would use them again.

## React and Vite

**What we used them for:** The browser dashboard, EDITH interface, and live MCP simulator.

**What worked well:** The fast feedback loop made it practical to iterate on a responsive demo while retaining a simple production build.

**What could improve:** A small, official offline/PWA checklist for Vite apps that use local APIs would be useful; caching dynamic personal data by default would be the wrong choice here.

**Onboarding and reuse:** Setup was direct and the build output is simple to host. We would use both again.

## SQLite

**What we used it for:** Local persistence for tasks, assistant records, reminders, and recovery history.

**What worked well:** It makes the project runnable by judges without a cloud account and supports an honest local-first privacy model.

**What could improve:** Clearer lightweight deployment guidance for safe single-user persistence versus multi-user tenancy would help hackathon teams avoid treating one shared database as a public SaaS backend.

**Onboarding and reuse:** SQLite was ideal for this single-user local workflow. We would use it again for similar projects.

## Groq API/SDK (optional)

**What we used it for:** Optional hosted responses for general EDITH conversation. Real task changes remain local validated functions, not model-generated SQL or shell commands.

**What worked well:** The function-tool calling interface fits the explicit action boundary.

**What could improve:** Development examples that foreground minimal-data prompts and local-action patterns would help privacy-conscious applications start with safer defaults.

**Onboarding and reuse:** Configuration is optional and does not block the core demo. We would use it again when hosted conversational replies add value.

## Alexa+ developer tooling disclosure

The Alexa+ Category SDK, MCP Toolkit, CLI, and Web Simulator are invite-only preview tools and were not used. This project instead follows the self-hosted MCP/server-and-simulation path permitted for the Alexa+ track. We would welcome a publicly accessible conformance client and simulator when the developer tooling becomes broadly available.
