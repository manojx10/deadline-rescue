Upgrade this existing Deadline Rescue project into EDITH, a capable personal AI operating system. IMPLEMENT changes directly; do not merely explain or generate a plan.

PRESERVE EVERYTHING: inspect the repository and git status first. Preserve the SQLite database, existing tasks, memories, backups, uncommitted changes, working features, voice settings, API endpoints, and Groq credentials. Never reset or recreate the database. Never commit, push, or deploy. Do not overwrite unrelated work.

1. GENERAL AI: Use the existing Groq integration for natural conversation, questions, explanations, coding assistance, planning, and follow-up context. Keep model calls separate from application actions. Use validated backend tools for actual changes. Never claim an action succeeded unless it did.

2. TASKS: Fix natural-language task creation and management. Support adding, listing, editing, completing, deleting, prioritizing, and planning tasks. Parse natural-language requests; ask for missing essential details; validate inputs; call real backend services; and confirm only actual database results. Preserve existing deterministic commands and MCP functionality.

3. CHAT HISTORY: Persist and restore chat messages across navigation, refreshes, and application restarts. Preserve ordering and follow-up context. Prevent duplicate submissions. Support intentional new conversations and clearing history. Never lose messages when navigating to Tasks or Calendar.

4. CALENDAR: Implement a real persistent calendar with functional month, week, and day views; Today and previous/next navigation; create/edit/cancel events; all-day events; event details; upcoming agenda; task deadlines; timezone-aware dates; conflict warnings; validation; and useful empty states. Use the existing database and API architecture. Add safe, non-destructive migrations only when needed.

5. AI SCHEDULING: Understand requests such as “What do I have tomorrow?”, “Schedule two hours for DBMS tomorrow evening”, “Find a free hour”, and “Move this event to Friday at 3 PM.” Use actual local task/event data through validated backend services. Check conflicts, clarify ambiguous times, and confirm consequential changes. Never invent events or claim nonexistent synchronization.

6. REMINDERS: Implement persistent task/event reminders and upcoming-event displays. Add browser notifications only with permission. Avoid duplicates and honestly document background-notification limitations.

7. MEMORY: Preserve existing memory functionality. Support explicitly requested save, retrieve, update, and delete operations. Keep memory separate from chat history and retrieve only relevant information.

8. VOICE: Preserve working speech input/output, voice preferences, and controls. Handle unsupported browsers and permission failures gracefully.

9. OS-LIKE UI: Integrate Assistant, Tasks, Calendar, Agenda, Memory, Activity, and Settings into the existing design and navigation. Keep the current visual identity, improve consistency and accessibility, and make every visible control functional. Avoid unnecessary redesigns, fake metrics, dead buttons, and placeholder functionality.

10. ALEXA+: Inspect its actual implementation. Clearly label it as a demo/integration concept unless a genuine verified Alexa integration exists. Preserve useful demo functionality without misleading claims.

11. PRIVACY: Keep GROQ_API_KEY only in backend/.env or a secure backend secret store; ensure it is gitignored. Never expose credentials in frontend code or logs. By default, send only the current user message to Groq. Never send task lists, calendar databases, saved memories, private files, or action logs to Groq. Perform application actions locally through validated backend functions. Do not add telemetry or cloud storage. Do not permit arbitrary model-generated SQL or shell execution. Clearly disclose any additional data transmission if absolutely necessary.

12. RELIABILITY: Preserve backward compatibility. Validate all inputs and tool arguments. Prevent duplicate actions. Handle errors without exposing secrets. Do not rely exclusively on brittle regex matching for natural-language intent. Keep existing frontend/backend workflows operational.

WORKFLOW: Inspect the current implementation, existing changes, database schema, API endpoints, tests, frontend routes, voice functionality, and Alexa+ demo. Implement the smallest safe integrated changes. Back up files before risky edits. Add/update tests. Run the complete backend test suite, frontend tests/lint if configured, and production build. Fix regressions and rerun tests. Review the final diff for accidental data loss, secret exposure, and unrelated modifications.

DEFINITION OF DONE: Chat survives navigation and refresh; natural-language task creation actually saves tasks; existing task features still work; calendar events persist and month/week/day views function; task deadlines appear on the calendar; scheduling uses real local data; reminders work within actual platform capabilities; voice remains intact; Alexa+ is accurately labelled; private records stay out of Groq requests; existing database data and backups remain intact; tests and build results are verified.

Do the implementation, not just a plan. Do not ask unnecessary questions or require me to run many commands. If credentials or platform capabilities prevent an optional integration, finish the available local functionality and document the genuine limitation.

FINAL OUTPUT ONLY:
STATUS: COMPLETE or PARTIAL
CHANGES: maximum 6 concise bullets
TESTS: actual results
PENDING: genuine blockers only
RUN: only if a restart/build command is required

Keep the final response short even if the implementation is extensive.
