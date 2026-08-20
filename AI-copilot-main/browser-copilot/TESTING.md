# Running the Test Suite (Windows)

## Prerequisites

1. **Python 3.9+** — download from https://www.python.org/downloads/
   - During install, check **"Add Python to PATH"**
2. **Node.js 18+** — download from https://nodejs.org/
3. The project folder on your laptop

---

## Backend Tests (Python / pytest)

Open **Command Prompt** or **PowerShell** and run the following steps.

### Step 1 — Go to the backend folder

```cmd
cd path\to\browser-copilot\backend
```

Example:
```cmd
cd C:\Users\YourName\Downloads\browser-copilot\backend
```

### Step 2 — Create a virtual environment

```cmd
python -m venv venv
```

### Step 3 — Activate the virtual environment

Command Prompt:
```cmd
venv\Scripts\activate.bat
```

PowerShell:
```powershell
venv\Scripts\Activate.ps1
```

> If PowerShell blocks the script with an execution policy error, run this first:
> ```powershell
> Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
> ```
> Then try activating again.

You should see `(venv)` appear at the start of your terminal line.

### Step 4 — Install dependencies

```cmd
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### Step 5 — Create the .env file

Command Prompt:
```cmd
echo GROQ_API_KEY=test-key > .env
```

PowerShell:
```powershell
"GROQ_API_KEY=test-key" | Out-File -FilePath .env -Encoding utf8
```

> The value `test-key` is a placeholder. Tests mock all API calls so no real key is needed.

### Step 6 — Run the tests

```cmd
pytest
```

Expected output:
```
collected 55 items

tests/test_agent_service.py ....................   [ 36%]
tests/test_gemini_service.py .............         [ 60%]
tests/test_routes.py ...............               [ 87%]
tests/test_vectordb_service.py .......             [100%]

55 passed in ~2s
```

### Other useful commands

Run a single test file:
```cmd
pytest tests\test_agent_service.py
pytest tests\test_routes.py -v
```

Run a specific test by name:
```cmd
pytest tests\test_agent_service.py::TestMalformedJSON::test_malformed_json_skipped_single
```

Deactivate the virtual environment when done:
```cmd
deactivate
```

---

## Frontend Tests (TypeScript / Vitest)

Open a **new** Command Prompt or PowerShell window.

### Step 1 — Go to the extension folder

```cmd
cd path\to\browser-copilot\extension
```

Example:
```cmd
cd C:\Users\YourName\Downloads\browser-copilot\extension
```

### Step 2 — Install dependencies

```cmd
npm install
```

This installs `vitest` and `jsdom` which are listed in `package.json`.

### Step 3 — Run the tests

```cmd
npm test
```

Expected output:
```
 RUN  v1.x.x

 ✓ tests/content.test.ts (40+)
   ✓ getUniqueSelector > returns #id when element has an id
   ✓ getUniqueSelector > returns [name=...] for name attribute
   ...
   ✓ executeAction > select_option > dispatches a change event after selection

 Test Files  1 passed (1)
 Tests       40+ passed
```

### Watch mode (re-runs tests automatically on file save)

```cmd
npm run test:watch
```

Press `Ctrl + C` to stop watch mode.

---

## What is tested

### Backend

| File | What it covers |
|------|----------------|
| `test_agent_service.py` | Keyword detection (go back, reload, typos), Groq tool-call parsing, malformed JSON handling, 10-action cap, timeout parameter |
| `test_gemini_service.py` | Prompt construction, page URL/title inclusion, memory results (RAG), content truncation at 12 000 chars |
| `test_vectordb_service.py` | `store_page` upsert with timestamp, `search_pages` with empty collection, result formatting, n_results cap, content truncation at 4 000 chars |
| `test_routes.py` | All HTTP endpoints (`/health`, `/ask`, `/remember`, `/agent`), optional fields, 422 on missing required fields |

### Frontend

| Suite | What it covers |
|-------|----------------|
| `getUniqueSelector` | ID shortcut, name attribute shortcut, nth-of-type for siblings, ancestor ID stops climbing, special character escaping |
| `extractPageText` | Title included, meta description included, script/style stripped, 10 000 char truncation |
| `extractInteractiveElements` | Inputs/buttons/links extracted correctly, hidden inputs excluded, limits (20/20/15), text trimming |
| `executeAction` | click, fill_input, press_enter, navigate_to_url, scroll_page, scroll_to_element, go_back, go_forward, reload_page, select_option — all with error and success cases |

---

## Notes

- Backend tests mock all external calls (Groq API, ChromaDB) — no real API keys needed
- Frontend tests mock all Chrome Extension APIs — no browser needed
- Neither test suite makes real network requests
- Make sure `(venv)` is active in your terminal before running `pytest`
- The `npm test` command does not need the venv — it runs independently
