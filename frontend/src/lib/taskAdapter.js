const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export function deadlineParts(deadline) {
  const [date = "", timePart = ""] = String(deadline || "").split("T");
  return { date, time: timePart.slice(0, 5) || "00:00" };
}

export function apiTaskToView(task) {
  const { date, time } = deadlineParts(task.deadline);
  const priority = String(task.priority || "medium").toLowerCase();
  return {
    id: task.id,
    title: task.title,
    project: task.project || "Personal",
    description: task.description || "",
    date,
    time,
    minutes: Number(task.estimated_minutes),
    priority: priorityLabels[priority] || "Medium",
    done: Boolean(task.completed),
    deadline: task.deadline,
  };
}

export function viewTaskToApiPayload(task) {
  const priority = String(task.priority || "medium").toLowerCase();
  return {
    title: task.title.trim(),
    project: task.project.trim() || "Personal",
    description: task.description || "",
    deadline: `${task.date}T${task.time || "00:00"}:00`,
    estimated_minutes: Number(task.minutes),
    priority,
  };
}

export function formatDateTime(value) {
  if (!value) return "No date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
