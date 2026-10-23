# Judge quickstart

This project runs entirely on a local machine. It does not require an Alexa+ account, a consumer Alexa+ device, cloud hosting, or a Groq key for the core demo.

## 1. Start it

Use the two commands in the [README](README.md#judge-quickstart), then open `http://127.0.0.1:5173`.

The browser simulator talks to the running self-hosted MCP endpoint at `http://127.0.0.1:5050/mcp`.

## 2. Evaluate the user flow

1. Create a task with a near-term deadline.
2. Open the focus planner and generate a plan for 60–120 minutes.
3. Use recovery to simulate lost time and inspect the revised plan.
4. Open the Alexa+/MCP simulator, initialize it, list the ten tools, and call a safe read tool such as `list_tasks`.
5. Refresh the page and confirm the task remains. The backing SQLite database is local to the machine.

## 3. Verify the protocol without the browser

In a separate terminal while the backend is running:

```bash
cd backend
.venv/bin/python demo_mcp_client.py
```

The output shows a real `initialize`, `tools/list`, and `tools/call` exchange. The script's call to `build_focus_plan` does not create or delete a task.

For a protected deployment, set `DEADLINE_RESCUE_MCP_URL` and the server-held `DEADLINE_RESCUE_MCP_TOKEN` in the client environment before running the same script. Neither value belongs in source code or browser configuration.

## 4. Run the checks

```bash
backend/.venv/bin/pytest -q
cd frontend && npm test && npm run lint && npm run build
```

The simulator is an honest web-based Alexa+ concept. It is not a live Alexa+ add-on and does not claim access to gated Alexa+ developer tools.
