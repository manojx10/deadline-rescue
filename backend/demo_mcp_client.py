"""Minimal real HTTP client for recording or verifying the MCP demo flow.

Run the FastAPI server first, then execute this script from ``backend/``.
It intentionally uses only Python's standard library so the demo is easy to
reproduce on a fresh machine.
"""

import json
import os
from urllib.request import Request, urlopen


def get_url():
    return os.environ.get("DEADLINE_RESCUE_MCP_URL", "http://127.0.0.1:5050/mcp")


def request_headers(method):
    """Use an optional server-held token without putting one in this file."""
    token = os.environ.get("DEADLINE_RESCUE_MCP_TOKEN", "").strip()
    return {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        **({"MCP-Protocol-Version": "2025-11-25"} if method != "initialize" else {}),
        **({"Authorization": f"Bearer {token}"} if token else {}),
    }


def call(request_id, method, params=None):
    payload = {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}
    request = Request(
        get_url(),
        data=json.dumps(payload).encode("utf-8"),
        headers=request_headers(method),
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
