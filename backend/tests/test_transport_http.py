"""HTTP transport regression tests for the MCP endpoint."""
import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

client = TestClient(main.app)
ACCEPT = "application/json, text/event-stream"
PROTOCOL_HEADERS = {
    "Accept": ACCEPT,
    "MCP-Protocol-Version": "2025-11-25",
}


def test_initialize_uses_supported_protocol_and_json_response():
    response = client.post(
        "/mcp",
        headers={"Accept": ACCEPT},
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-11-25",
                "capabilities": {},
                "clientInfo": {"name": "transport-test", "version": "1"},
            },
        },
    )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/json")
    assert response.headers["mcp-protocol-version"] == "2025-11-25"
    assert response.json()["result"]["protocolVersion"] == "2025-11-25"


def test_tool_discovery_returns_all_ten_tools():
    response = client.post(
        "/mcp",
        headers=PROTOCOL_HEADERS,
        json={"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
    )
    assert response.status_code == 200
    assert len(response.json()["result"]["tools"]) == 10


def test_notification_returns_202_without_body():
    response = client.post(
        "/mcp",
        headers=PROTOCOL_HEADERS,
        json={"jsonrpc": "2.0", "method": "notifications/initialized"},
    )
    assert response.status_code == 202
    assert response.content == b""


def test_post_requires_both_mcp_accept_media_types():
    payload = {"jsonrpc": "2.0", "id": 3, "method": "ping"}
    for accept in ("", "application/json", "text/event-stream"):
        response = client.post(
            "/mcp",
            headers={"Accept": accept, "Content-Type": "application/json"},
            content=json.dumps(payload),
        )
        assert response.status_code == 406


def test_rejects_wrong_content_type_and_untrusted_origin():
    payload = {"jsonrpc": "2.0", "id": 4, "method": "ping"}
    for content_type in ("text/plain", "application/json-not-really"):
        response = client.post(
            "/mcp",
            headers={"Accept": ACCEPT, "Content-Type": content_type},
            content=json.dumps(payload),
        )
        assert response.status_code == 415

    response = client.post(
        "/mcp",
        headers={"Accept": ACCEPT, "Origin": "https://untrusted.example"},
        json=payload,
    )
    assert response.status_code == 403


def test_post_initialization_requests_require_the_negotiated_protocol_header():
    payload = {"jsonrpc": "2.0", "id": 5, "method": "tools/list", "params": {}}

    missing = client.post("/mcp", headers={"Accept": ACCEPT}, json=payload)
    assert missing.status_code == 400

    unsupported = client.post(
        "/mcp",
        headers={**PROTOCOL_HEADERS, "MCP-Protocol-Version": "2025-03-26"},
        json=payload,
    )
    assert unsupported.status_code == 400


def test_get_stream_is_explicitly_unsupported():
    response = client.get("/mcp", headers={"Accept": "text/event-stream"})
    assert response.status_code == 405
    assert response.headers["allow"] == "POST"
