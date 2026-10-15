import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEST_DATABASE = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
TEST_DATABASE.close()
os.environ["DEADLINE_RESCUE_DATABASE_PATH"] = TEST_DATABASE.name
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main


class MCPProtocolTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        Path(TEST_DATABASE.name).unlink(missing_ok=True)

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
        self.assertIn("recover_from_disruption", [tool["name"] for tool in tools])
        self.assertTrue(all("inputSchema" in tool for tool in tools))

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
