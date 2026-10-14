# Test instructions

See README.md for installation on macOS, Linux, and Windows.

Backend: install requirements-dev.txt in a virtual environment, then run `pytest` from backend/.
Frontend: run `npm ci`, `npm test`, `npx tsc --noEmit`, and `npm run build` from extension/.

Validated in this update: 62 backend tests and 53 frontend tests, plus TypeScript checking and a production extension build. External model calls, database services, and Chrome APIs are mocked. This does not establish live Groq/ChromaDB compatibility or real-browser task completion. Follow BENCHMARK.md for browser evaluation.

Regression tests cover action validation, URL restrictions, argument tampering, stale-passage replacement, memory deletion, duplicate field names, script exclusion, duplicate form submissions, and asynchronous clipboard failures.
