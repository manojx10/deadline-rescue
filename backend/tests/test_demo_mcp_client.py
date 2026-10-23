import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import demo_mcp_client  # noqa: E402


def test_demo_client_only_sends_authorization_when_configured(monkeypatch):
    monkeypatch.delenv("DEADLINE_RESCUE_MCP_TOKEN", raising=False)
    assert "Authorization" not in demo_mcp_client.request_headers("initialize")

    monkeypatch.setenv("DEADLINE_RESCUE_MCP_TOKEN", "test-client-token")
    headers = demo_mcp_client.request_headers("tools/list")

    assert headers["Authorization"] == "Bearer test-client-token"
    assert headers["MCP-Protocol-Version"] == "2025-11-25"


def test_demo_client_uses_configured_url_without_embedding_a_token(monkeypatch):
    monkeypatch.setenv("DEADLINE_RESCUE_MCP_URL", "https://example.test/mcp")
    monkeypatch.setenv("DEADLINE_RESCUE_MCP_TOKEN", "test-client-token")

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def read(self):
            return b'{"jsonrpc":"2.0","id":1,"result":{}}'

    with patch.object(demo_mcp_client, "urlopen", return_value=FakeResponse()) as urlopen:
        assert demo_mcp_client.call(1, "tools/list") == {"jsonrpc": "2.0", "id": 1, "result": {}}

    request = urlopen.call_args.args[0]
    assert request.full_url == "https://example.test/mcp"
    assert request.get_header("Authorization") == "Bearer test-client-token"
