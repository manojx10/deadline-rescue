"""Minimal real HTTP client for recording or verifying the MCP demo flow.

Run the FastAPI server first, then execute this script from ``backend/``.
It intentionally uses only Python's standard library so the demo is easy to
reproduce on a fresh machine.
"""

import json
from urllib.request import Request, urlopen


URL = "http://127.0.0.1:8000/mcp"


def call(request_id, method, params=None):
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
    request = Request(
        URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "Accept": "application/json, text/event-stream"},
        method="POST",
    )
    with urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


if __name__ == "__main__":
    print(json.dumps(call(1, "initialize", {
        "protocolVersion": "2025-11-25",
        "capabilities": {},
        "clientInfo": {"name": "deadline-rescue-demo", "version": "1.0.0"},
    }), indent=2))
    print(json.dumps(call(2, "tools/list"), indent=2))
    print(json.dumps(call(3, "tools/call", {
        "name": "build_focus_plan",
        "arguments": {"available_minutes": 120},
    }), indent=2))
