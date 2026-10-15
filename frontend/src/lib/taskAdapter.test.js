import test from "node:test";
import assert from "node:assert/strict";
import { apiTaskToView, deadlineParts, viewTaskToApiPayload } from "./taskAdapter.js";

test("maps persisted API tasks into the view model", () => {
  const task = apiTaskToView({
    id: 9,
    title: "Ship the demo",
    project: "Hackathon",
    deadline: "2026-10-20T09:30:00+05:30",
    estimated_minutes: 75,
    priority: "urgent",
    completed: false,
  });
  assert.deepEqual(task, {
    id: 9,
    title: "Ship the demo",
    project: "Hackathon",
    description: "",
    date: "2026-10-20",
    time: "09:30",
    minutes: 75,
    priority: "Urgent",
    done: false,
    deadline: "2026-10-20T09:30:00+05:30",
  });
});

test("maps task-form values into a backend payload", () => {
  assert.deepEqual(
    viewTaskToApiPayload({
      title: "  Focus block ",
      project: "Personal",
      description: "",
      date: "2026-10-20",
      time: "14:15",
      minutes: "45",
      priority: "High",
    }),
    {
      title: "Focus block",
      project: "Personal",
      description: "",
      deadline: "2026-10-20T14:15:00",
      estimated_minutes: 45,
      priority: "high",
    },
  );
});

test("returns predictable date and time parts", () => {
  assert.deepEqual(deadlineParts("2026-10-20T14:15:00"), { date: "2026-10-20", time: "14:15" });
});
