import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scheduler import analyze_deadline_risks, build_schedule, prioritize_tasks, recover_schedule


class SchedulerTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 10, 15, 9, 0, tzinfo=timezone.utc)

    def task(self, task_id, title, minutes, deadline_offset, priority="medium"):
        return {
            "id": task_id,
            "title": title,
            "estimated_minutes": minutes,
            "deadline": (self.now + timedelta(minutes=deadline_offset)).isoformat(),
            "priority": priority,
            "completed": False,
        }

    def test_schedule_is_deadline_aware_and_never_overbooks(self):
        tasks = [
            self.task(1, "Later task", 45, 360, "high"),
            self.task(2, "Near deadline", 30, 60, "medium"),
            self.task(3, "Does not fit", 50, 480, "low"),
        ]
        result = build_schedule(tasks, available_minutes=75, start_time=self.now)

        self.assertEqual(result["scheduled_count"], 2)
        self.assertEqual(result["scheduled_minutes"], 75)
        self.assertEqual(result["remaining_minutes"], 0)
        self.assertEqual(result["schedule"][0]["title"], "Near deadline")
        self.assertEqual(result["unscheduled"][0]["task"]["title"], "Does not fit")

    def test_risk_analysis_flags_impossible_and_tight_work(self):
        tasks = [
            self.task(1, "Impossible", 45, 30),
            self.task(2, "Tight", 40, 55),
            self.task(3, "Comfortable", 30, 300),
        ]
        risks = analyze_deadline_risks(tasks, now=self.now)

        self.assertEqual([risk["risk_level"] for risk in risks], ["critical", "high"])
        self.assertEqual(risks[0]["title"], "Impossible")

    def test_mixed_timezone_deadlines_sort_without_type_error(self):
        tasks = [
            self.task(1, "UTC", 20, 120),
            {
                **self.task(2, "Naive", 20, 100),
                "deadline": "2026-10-15T10:40:00",
            },
        ]
        ordered = prioritize_tasks(tasks, now=self.now)
        self.assertEqual(len(ordered), 2)

    def test_task_that_exceeds_available_time_is_deferred_without_truncation(self):
        task = self.task(1, "Amazon", 150, 8 * 60, "high")
        result = build_schedule([task], available_minutes=120, start_time=self.now)

        self.assertEqual(result["scheduled_count"], 0)
        self.assertEqual(result["scheduled_minutes"], 0)
        self.assertEqual(result["remaining_minutes"], 120)
        self.assertEqual(result["unscheduled"][0]["task"]["title"], "Amazon")
        self.assertIn("Insufficient available time", result["unscheduled"][0]["reason"])

    def test_completed_tasks_are_excluded_from_schedule(self):
        task = self.task(1, "Already completed", 30, 8 * 60, "urgent")
        task["completed"] = True
        result = build_schedule([task], available_minutes=120, start_time=self.now)

        self.assertEqual(result["scheduled_count"], 0)
        self.assertEqual(result["unscheduled_count"], 0)
        self.assertEqual(result["schedule"], [])

    def test_recovery_deducts_disruption_before_replanning(self):
        result = recover_schedule(
            [self.task(1, "Important", 60, 240, "high")],
            disruption_minutes=30,
            available_minutes=90,
            now=self.now,
        )
        self.assertEqual(result["available_minutes_after_disruption"], 60)
        self.assertEqual(result["schedule"]["scheduled_count"], 1)
        self.assertEqual(result["schedule"]["schedule"][0]["start"], (self.now + timedelta(minutes=30)).isoformat())


if __name__ == "__main__":
    unittest.main()
