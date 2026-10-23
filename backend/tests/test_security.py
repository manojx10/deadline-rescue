"""Regression tests for the public API and MCP hardening layer."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402


client = TestClient(main.app)
MCP_ACCEPT = "application/json, text/event-stream"
SECURITY_ENVIRONMENT = (
    "APP_ENV",
    "API_REQUIRE_AUTH",
    "MCP_REQUIRE_AUTH",
    "DEADLINE_RESCUE_API_TOKEN",
    "DEADLINE_RESCUE_MCP_TOKEN",
    "API_RATE_LIMIT_PER_MINUTE",
    "MCP_RATE_LIMIT_PER_MINUTE",
    "ASSISTANT_RATE_LIMIT_PER_MINUTE",
    "MAX_REQUEST_BODY_BYTES",
    "FORCE_HTTPS",
)


@pytest.fixture(autouse=True)
def clean_security_configuration(monkeypatch):
    for name in SECURITY_ENVIRONMENT:
        monkeypatch.delenv(name, raising=False)
    main.rate_limiter.clear()
    yield
    main.rate_limiter.clear()


def test_api_responses_have_browser_security_headers_and_are_not_cacheable():
    response = client.get("/api/tasks")

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]


def test_deployment_token_protects_api_and_mcp(monkeypatch):
    monkeypatch.setenv("DEADLINE_RESCUE_API_TOKEN", "api-test-token")

    rejected = client.get("/api/tasks")
    accepted = client.get(
        "/api/tasks", headers={"Authorization": "Bearer api-test-token"}
    )
    mcp_rejected = client.post(
        "/mcp",
        headers={"Accept": MCP_ACCEPT},
        json={"jsonrpc": "2.0", "id": 1, "method": "ping"},
    )
    mcp_accepted = client.post(
        "/mcp",
        headers={
            "Accept": MCP_ACCEPT,
            "Authorization": "Bearer api-test-token",
            "MCP-Protocol-Version": "2025-11-25",
        },
        json={"jsonrpc": "2.0", "id": 2, "method": "ping"},
    )

    assert rejected.status_code == 401
    assert rejected.headers["www-authenticate"] == "Bearer"
    assert accepted.status_code == 200
    assert mcp_rejected.status_code == 401
    assert mcp_accepted.status_code == 200


def test_production_without_a_token_fails_closed(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")

    response = client.get("/api/tasks")

    assert response.status_code == 503
    assert "no server token" in response.json()["detail"]


def test_rate_limit_and_body_limit_return_safe_client_errors(monkeypatch):
    monkeypatch.setenv("API_RATE_LIMIT_PER_MINUTE", "2")

    assert client.get("/api/health").status_code == 200
    assert client.get("/api/health").status_code == 200
    throttled = client.get("/api/health")

    assert throttled.status_code == 429
    assert int(throttled.headers["retry-after"]) >= 1

    main.rate_limiter.clear()
    monkeypatch.setenv("MAX_REQUEST_BODY_BYTES", "1")
    too_large = client.post("/api/tasks", content="{}")

    assert too_large.status_code == 413


def test_untrusted_browser_origin_does_not_receive_cors_permission():
    response = client.options(
        "/api/tasks",
        headers={
            "Origin": "https://untrusted.example",
            "Access-Control-Request-Method": "POST",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
