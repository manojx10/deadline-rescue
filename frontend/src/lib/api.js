import { apiTaskToView, viewTaskToApiPayload } from "./taskAdapter";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
// Local Vite development talks to the FastAPI port. Production can be served
// behind the same-origin private-preview proxy, so no browser token is needed.
export const apiBaseUrl = (
  configuredApiBaseUrl || (import.meta.env.DEV ? "http://127.0.0.1:5050" : "")
).replace(/\/+$/, "");
const mcpProtocolVersion = "2025-11-25";

function mcpHeaders(method) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(method === "initialize" ? {} : { "MCP-Protocol-Version": mcpProtocolVersion }),
  };
}

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = Array.isArray(body.detail)
      ? body.detail.map((item) => item.msg).join(", ")
      : body.detail;
    throw new Error(detail || body.message || "Deadline Rescue could not complete that request.");
  }
  return body;
}

async function mcpRequest(method, params = {}, id = crypto.randomUUID()) {
  const response = await fetch(`${apiBaseUrl}/mcp`, {
    method: "POST",
    headers: mcpHeaders(method),
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(body.error?.message || "The MCP server did not accept that request.");
  }
  return body.result;
}

export const api = {
  async listTasks() {
    const result = await request("/api/tasks");
    return result.tasks.map(apiTaskToView);
  },
  async createTask(task) {
    const result = await request("/api/tasks", {
      method: "POST",
      body: JSON.stringify(viewTaskToApiPayload(task)),
    });
    return apiTaskToView(result.task);
  },
  async updateTask(id, updates) {
    const result = await request(`/api/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    });
    return apiTaskToView(result.task);
  },
  async deleteTask(id) {
    await request(`/api/tasks/${id}`, { method: "DELETE" });
  },
  async getSchedule(availableMinutes) {
    const result = await request(`/api/schedule?available_minutes=${encodeURIComponent(availableMinutes)}`);
    return result.result;
  },
  async getDeadlineRisks() {
    const result = await request("/api/deadline-risks");
    return result.risks;
  },
  async recover(availableMinutes, disruptionMinutes) {
    return request("/api/recover", {
      method: "POST",
      body: JSON.stringify({ available_minutes: availableMinutes, disruption_minutes: disruptionMinutes }),
    });
  },
  async getRecoveryHistory(limit = 3) {
    const result = await request(`/api/recovery-history?limit=${encodeURIComponent(limit)}`);
    return result.events;
  },
  async assistantChat(message) {
    return request("/api/assistant/chat", { method: "POST", body: JSON.stringify({ message }) });
  },
  async getAssistantMemory() {
    const result = await request("/api/assistant/memory");
    return result.memory;
  },
  async saveAssistantMemory(key, value) {
    return request("/api/assistant/memory", { method: "PUT", body: JSON.stringify({ key, value }) });
  },
  async getAssistantActions(limit = 20) {
    const result = await request(`/api/assistant/actions?limit=${encodeURIComponent(limit)}`);
    return result.actions;
  },
  async initializeMcp() {
    const result = await mcpRequest("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "deadline-rescue-web-simulator", version: "1.0.0" },
    });
    await fetch(`${apiBaseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders("notifications/initialized"),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }),
    });
    const toolList = await mcpRequest("tools/list");
    return { server: result, tools: toolList.tools };
  },
  async callMcpTool(name, arguments_ = {}) {
    return mcpRequest("tools/call", { name, arguments: arguments_ });
  },
};
