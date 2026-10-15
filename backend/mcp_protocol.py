"""A small, dependency-free Streamable HTTP MCP protocol adapter.

Deadline Rescue only needs a focused set of tools, so this module implements
the JSON-RPC surface directly instead of hiding the protocol behind a large
framework.  It supports the MCP 2025-11-25 handshake plus tool discovery and
tool calls; FastAPI provides the HTTP transport in ``main.py``.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Dict, Mapping, Optional


MCP_PROTOCOL_VERSION = "2025-11-25"


class ToolInputError(ValueError):
    """Raised when a tool caller supplies invalid arguments."""


def _success(request_id: Any, result: Dict[str, Any]) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str, data: Any = None) -> Dict[str, Any]:
    error: Dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


def text_tool_result(payload: Dict[str, Any], is_error: bool = False) -> Dict[str, Any]:
    """Return a standards-friendly tool result with both text and structured data."""
    return {
        "content": [{"type": "text", "text": json.dumps(payload, indent=2)}],
        "structuredContent": payload,
        "isError": is_error,
    }


class DeadlineRescueMCPServer:
    """Stateless MCP server handling the methods used by the web simulator."""

    def __init__(
        self,
        tools: list[Dict[str, Any]],
        handlers: Mapping[str, Callable[[Dict[str, Any]], Dict[str, Any]]],
    ) -> None:
        self.tools = tools
        self.handlers = handlers

    def handle(self, message: Any) -> Optional[Dict[str, Any]]:
        """Handle one JSON-RPC request; notifications intentionally return None."""
        if not isinstance(message, dict):
            return _error(None, -32600, "Invalid Request")

        request_id = message.get("id")
        is_notification = "id" not in message
        if message.get("jsonrpc") != "2.0" or not isinstance(message.get("method"), str):
            return None if is_notification else _error(request_id, -32600, "Invalid Request")

        method = message["method"]
        params = message.get("params", {})
        if params is None:
            params = {}
        if not isinstance(params, dict):
            return None if is_notification else _error(request_id, -32602, "Invalid params")

        if method == "initialize":
            if is_notification:
                return None
            return _success(
                request_id,
                {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {"tools": {"listChanged": False}},
                    "serverInfo": {"name": "deadline-rescue", "version": "1.0.0"},
                    "instructions": (
                        "Deadline Rescue keeps a persistent task list and builds "
                        "deadline-aware focus and disruption-recovery plans."
                    ),
                },
            )

        if method == "notifications/initialized":
            return None

        if method == "ping":
            return None if is_notification else _success(request_id, {})

        if method == "tools/list":
            return None if is_notification else _success(request_id, {"tools": self.tools})

        if method == "tools/call":
            if is_notification:
                return None

            name = params.get("name")
            arguments = params.get("arguments", {})
            if not isinstance(name, str) or not isinstance(arguments, dict):
                return _error(request_id, -32602, "Tool name and arguments are required.")

            handler = self.handlers.get(name)
            if handler is None:
                return _success(
                    request_id,
                    text_tool_result({"error": f"Unknown tool: {name}"}, is_error=True),
                )

            try:
                result = handler(arguments)
            except ToolInputError as error:
                return _success(
                    request_id,
                    text_tool_result({"error": str(error)}, is_error=True),
                )
            except Exception:  # Keep server details out of client-visible tool output.
                return _success(
                    request_id,
                    text_tool_result(
                        {"error": "Deadline Rescue could not complete that action."},
                        is_error=True,
                    ),
                )

            return _success(request_id, text_tool_result(result))

        return None if is_notification else _error(request_id, -32601, "Method not found")
