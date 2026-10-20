import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main


class MCPProtocolTests(unittest.TestCase):
    def request(self, request_id, method, params=None):
        return main.mcp_server.handle({
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
            "params": params or {},
        })

    def test_initialize_and_tool_discovery(self):
        initialized = self.request(1, "initialize", {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0.0"},
        })
        self.assertEqual(initialized["result"]["protocolVersion"], "2025-11-25")

        tools = self.request(2, "tools/list")["result"]["tools"]
        self.assertEqual(
            {tool["name"] for tool in tools},
            {
                "list_tasks",
                "create_task",
                "set_task_status",
                "build_focus_plan",
                "recover_from_disruption",
                "get_deadline_risks",
                "get_recovery_history",
                "list_reminders",
                "create_reminder",
                "update_reminder",
            },
        )
        self.assertTrue(all("inputSchema" in tool for tool in tools))
        self.assertTrue(
            all(
                tool["inputSchema"].get("additionalProperties") is False
                for tool in tools
            )
        )

    def test_initialize_rejects_an_unsupported_protocol_version(self):
        response = self.request(3, "initialize", {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "test-client", "version": "1.0.0"},
        })

        self.assertEqual(response["error"]["code"], -32602)
        self.assertEqual(
            response["error"]["data"]["supported"],
            ["2025-11-25"],
        )

    def test_groq_tool_definitions_use_the_same_canonical_schemas(self):
        tools = main.groq_tool_definitions()

        self.assertEqual(len(tools), len(main.MCP_TOOLS))
        self.assertTrue(all(tool["type"] == "function" for tool in tools))
        self.assertEqual(
            [tool["function"]["name"] for tool in tools],
            [tool["name"] for tool in main.MCP_TOOLS],
        )
        self.assertEqual(
            [tool["function"]["parameters"] for tool in tools],
            [tool["inputSchema"] for tool in main.MCP_TOOLS],
        )

    def test_tool_calls_reject_undeclared_or_invalid_arguments(self):
        response = self.request(3, "tools/call", {
            "name": "build_focus_plan",
            "arguments": {
                "available_minutes": 30,
                "unexpected": True,
            },
        })["result"]

        self.assertTrue(response["isError"])
        self.assertIn(
            "Unexpected tool argument",
            response["structuredContent"]["error"],
        )

        response = self.request(4, "tools/call", {
            "name": "list_reminders",
            "arguments": {"include_completed": "false"},
        })["result"]

        self.assertTrue(response["isError"])
        self.assertIn(
            "include_completed must be a boolean",
            response["structuredContent"]["error"],
        )

    def test_tools_persist_and_recover_a_task(self):
        deadline = (datetime.now(timezone.utc) + timedelta(hours=6)).isoformat()
        created = self.request(3, "tools/call", {
            "name": "create_task",
            "arguments": {
                "title": "Test MCP recovery",
                "project": "Tests",
                "deadline": deadline,
                "estimated_minutes": 30,
                "priority": "high",
            },
        })["result"]["structuredContent"]
        task_id = created["task"]["id"]

        plan = self.request(4, "tools/call", {
            "name": "build_focus_plan",
            "arguments": {"available_minutes": 45},
        })["result"]["structuredContent"]
        self.assertEqual(plan["schedule"]["scheduled_count"], 1)

        recovery = self.request(5, "tools/call", {
            "name": "recover_from_disruption",
            "arguments": {"available_minutes": 45, "disruption_minutes": 15},
        })["result"]["structuredContent"]
        self.assertIn("recovery_event_id", recovery)

        updated = self.request(6, "tools/call", {
            "name": "set_task_status",
            "arguments": {"task_id": task_id, "completed": True},
        })["result"]["structuredContent"]
        self.assertTrue(updated["task"]["completed"])


if __name__ == "__main__":
    unittest.main()
