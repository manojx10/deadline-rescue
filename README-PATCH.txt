Consolidated non-frontend patch

Files:
- backend/main.py: validates that MCP POST Accept includes both application/json and text/event-stream.
- backend/tests/test_transport_http.py: HTTP transport regression tests.
- docs/MCP-COMPLIANCE.md: verified behavior and remaining release gate.
- FRICTION.md: honest friction-log template; add only real incidents.
- DEMO-SCRIPT.md: concise demo outline under three minutes.
- SUBMISSION-CHECKLIST.md: submission readiness list.
- LICENSE: MIT license text; review the choice before publishing if you need a different license.

Apply at the project root after making a backup. The patch intentionally does not change the frontend UI. Then run `cd backend && .venv/bin/pytest -q` and `cd frontend && npm run build`.

Note: this archive was assembled from the backend source included in the latest assistant patch, not from a full copy of your live Mac repository. Preserve your current database and compare changes before replacing files. The tests and build must be run locally before claiming verification.
