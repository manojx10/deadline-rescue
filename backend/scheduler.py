"""
Deadline Rescue — Scheduling and Recovery Engine

Provides deterministic task prioritization, schedule generation,
deadline-risk analysis, and recovery after unexpected interruptions.
"""

from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional


PRIORITY_WEIGHTS = {
    "low": 1,
    "medium": 2,
    "high": 3,
    "urgent": 4,
}


def parse_datetime(value: Any) -> datetime:
    """Convert an ISO datetime string or datetime object to datetime."""
    if isinstance(value, datetime):
        return value

    if not isinstance(value, str):
        raise ValueError("Datetime must be a datetime object or ISO string.")

    normalized = value.strip()

    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"

    return datetime.fromisoformat(normalized)


def normalize_datetime(value: datetime, reference: datetime) -> datetime:
    """Normalize timezone awareness to match the reference datetime."""
    if reference.tzinfo is None:
        return value.replace(tzinfo=None) if value.tzinfo else value

    if value.tzinfo is None:
        return value.replace(tzinfo=reference.tzinfo)

    return value.astimezone(reference.tzinfo)


def task_priority_score(task: Dict[str, Any], now: datetime) -> float:
    """
    Rank tasks using explicit priority, deadline proximity, and duration.

    Higher scores indicate tasks that deserve earlier attention.
    """
    deadline = parse_datetime(task["deadline"])
    deadline = normalize_datetime(deadline, now)

    priority = str(task.get("priority", "medium")).lower()
    priority_weight = PRIORITY_WEIGHTS.get(priority, 2)

    minutes_remaining = (deadline - now).total_seconds() / 60
    duration = max(1, int(task.get("estimated_minutes", 1)))

    if minutes_remaining <= 0:
        # Overdue tasks become increasingly urgent, capped to preserve
        # the influence of explicit priority and task duration.
        overdue_hours = abs(minutes_remaining) / 60
        urgency_score = min(130, 100 + overdue_hours / 24 * 5)
    elif minutes_remaining <= duration:
        urgency_score = 80
    elif minutes_remaining <= 180:
        urgency_score = 60
    elif minutes_remaining <= 1440:
        urgency_score = 40
    elif minutes_remaining <= 4320:
        urgency_score = 25
    else:
        urgency_score = 10

    duration_factor = min(duration / 60, 8)

    return (
        priority_weight * 15
        + urgency_score
        - duration_factor
    )


def prioritize_tasks(
    tasks: List[Dict[str, Any]],
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Return unfinished tasks ordered by calculated priority."""
    current_time = now or datetime.now().astimezone()

    unfinished = [
        dict(task)
        for task in tasks
        if not task.get("completed", False)
    ]

    for task in unfinished:
        task["priority_score"] = round(
            task_priority_score(task, current_time),
            2,
        )

    return sorted(
        unfinished,
        key=lambda task: (
            -task["priority_score"],
            normalize_datetime(parse_datetime(task["deadline"]), current_time),
        ),
    )


def build_schedule(
    tasks: List[Dict[str, Any]],
    available_minutes: int,
    start_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Build a schedule from the current time using available work minutes.

    Tasks that cannot fit are returned as unscheduled. A task is not
    silently truncated to make it fit.
    """
    if available_minutes < 0:
        raise ValueError("Available minutes cannot be negative.")

    schedule_start = start_time or datetime.now().astimezone()
    current_time = schedule_start
    remaining_minutes = available_minutes
    scheduled = []
    unscheduled = []

    ordered_tasks = prioritize_tasks(tasks, current_time)

    for task in ordered_tasks:
        duration = int(task.get("estimated_minutes", 0))

        if duration <= 0:
            unscheduled.append({
                "task": task,
                "reason": "Task duration must be greater than zero.",
            })
            continue

        deadline = normalize_datetime(
            parse_datetime(task["deadline"]),
            current_time,
        )

        if deadline <= current_time:
            unscheduled.append({
                "task": task,
                "reason": "Deadline has already passed.",
            })
            continue

        if duration > remaining_minutes:
            unscheduled.append({
                "task": task,
                "reason": (
                    "Insufficient available time to schedule the full task."
                ),
            })
            continue

        task_start = current_time
        task_end = task_start + timedelta(minutes=duration)

        if task_end > deadline:
            unscheduled.append({
                "task": task,
                "reason": "The task would finish after its deadline.",
            })
            continue

        scheduled.append({
            "task_id": task.get("id"),
            "title": task.get("title", "Untitled task"),
            "start": task_start.isoformat(),
            "end": task_end.isoformat(),
            "duration_minutes": duration,
            "deadline": deadline.isoformat(),
            "priority": task.get("priority", "medium"),
        })

        current_time = task_end
        remaining_minutes -= duration

    return {
        "generated_at": schedule_start.isoformat(),
        "available_minutes": available_minutes,
        "scheduled_minutes": available_minutes - remaining_minutes,
        "remaining_minutes": remaining_minutes,
        "scheduled_count": len(scheduled),
        "unscheduled_count": len(unscheduled),
        "schedule": scheduled,
        "unscheduled": unscheduled,
    }


def analyze_deadline_risks(
    tasks: List[Dict[str, Any]],
    now: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Identify tasks that are overdue or have insufficient time remaining."""
    current_time = now or datetime.now().astimezone()
    risks = []

    for task in tasks:
        if task.get("completed", False):
            continue

        deadline = normalize_datetime(
            parse_datetime(task["deadline"]),
            current_time,
        )

        duration = int(task.get("estimated_minutes", 0))
        minutes_remaining = (
            deadline - current_time
        ).total_seconds() / 60

        if minutes_remaining <= 0:
            risk_level = "critical"
            reason = "The deadline has passed."
        elif minutes_remaining < duration:
            risk_level = "critical"
            reason = "Not enough time remains to complete the task."
        elif minutes_remaining <= duration * 1.5:
            risk_level = "high"
            reason = "The deadline is approaching with little spare time."
        elif minutes_remaining <= duration * 3:
            risk_level = "medium"
            reason = "The task should be started soon."
        else:
            continue

        risks.append({
            "task_id": task.get("id"),
            "title": task.get("title", "Untitled task"),
            "deadline": deadline.isoformat(),
            "estimated_minutes": duration,
            "minutes_remaining": round(minutes_remaining, 1),
            "risk_level": risk_level,
            "reason": reason,
        })

    risk_order = {
        "critical": 0,
        "high": 1,
        "medium": 2,
    }

    return sorted(
        risks,
        key=lambda item: (
            risk_order[item["risk_level"]],
            item["minutes_remaining"],
        ),
    )


def recover_schedule(
    tasks: List[Dict[str, Any]],
    disruption_minutes: int,
    available_minutes: int,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """
    Rebuild the schedule after an interruption consumes time.

    The caller supplies the remaining available work minutes before
    the interruption. The interruption is deducted before replanning.
    """
    if disruption_minutes < 0:
        raise ValueError("Disruption duration cannot be negative.")

    if available_minutes < 0:
        raise ValueError("Available minutes cannot be negative.")

    current_time = now or datetime.now().astimezone()
    remaining_time = max(0, available_minutes - disruption_minutes)

    updated_start = current_time + timedelta(
        minutes=disruption_minutes
    )

    recovered = build_schedule(
        tasks=tasks,
        available_minutes=remaining_time,
        start_time=updated_start,
    )

    risks = analyze_deadline_risks(
        tasks=tasks,
        now=updated_start,
    )

    return {
        "success": True,
        "disruption_minutes": disruption_minutes,
        "available_minutes_before_disruption": available_minutes,
        "available_minutes_after_disruption": remaining_time,
        "recovery_start": updated_start.isoformat(),
        "schedule": recovered,
        "deadline_risks": risks,
        "explanation": (
            "The schedule was recalculated after accounting for the "
            "interruption. Tasks that no longer fit are listed as "
            "unscheduled, and deadline risks are reported separately."
        ),
    }
