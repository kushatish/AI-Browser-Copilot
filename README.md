# AI Browser Copilot

An AI assistant that sits beside your browser tab. Ask it about the page you're reading, or give it a task such as filling a search box and opening a result. You review each browser action before it runs.

The project combines a Chrome extension with a local Python backend. It uses Groq for language model responses and ChromaDB to retrieve passages from pages you've chosen to save.

## What you can do

### Ask about the current page

Open the sidebar, select **Ask**, and enter a question. The extension reads the current page and sends its text to the backend. If you have enabled browsing memory, the backend also retrieves relevant saved passages to help answer your question.

Example questions:

- “Summarize this article in five points.”
- “What are the main differences between the plans on this page?”
- “What did the page I saved earlier say about this topic?”

The model is instructed to include source links when it uses supplied page content. These links and the answer still need your judgment; citations are not independently verified.

### Perform browser actions

Select **Act** and describe what you want to do. The assistant reads the page's available controls, proposes one action, and waits for your approval. After executing it, the assistant reads the updated page before choosing the next step.

For example, try “Search for Python tutorials” on a page with a search form.

Supported actions include clicking, filling text fields, pressing Enter, selecting dropdown options, opening links, scrolling, copying text, and moving back or forward through browser history.

Each task has a limit of 12 steps. You can cancel an approval or stop further steps. An action already sent to the page cannot be undone by the stop button.

### Choose what the assistant remembers

Memory is off by default. Use **Enable site memory** to save the current page and future page loads from that site's origin. Saved content stays in the local ChromaDB database; relevant passages may be sent to Groq when you ask a question.

Memory is disabled in incognito and on pages containing password fields. This check cannot identify every sensitive page, so only enable memory on sites you're comfortable saving. Disabling a site stops future saves; **Delete memory** removes saved passages and resets all site memory permissions.

## Tech stack

| Part | Technology |
| --- | --- |
| Browser extension | Chrome Manifest V3 |
| Sidebar | React, TypeScript, CSS |
| Backend | Python, FastAPI |
| Language model | Llama 3.3 70B through Groq |
| Browsing memory | ChromaDB |
| Build tools | Vite, TypeScript |
| Tests | pytest, Vitest, jsdom |

## Run it locally

You'll need Chrome, Node.js 20 or later, Python 3.11 or 3.12, and a Groq API key. Dependency installation and model requests require internet access. ChromaDB may also download its default embedding model on first use.

The commands below assume you're inside the `browser-copilot` folder extracted from the ZIP.

### 1. Set up the backend

On macOS or Linux:

```sh
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

On Windows Command Prompt:

```bat
cd backend
python -m venv venv
venv\Scripts\activate.bat
pip install -r requirements.txt
copy .env.example .env
```

For Windows PowerShell, activate the environment with `venv\Scripts\Activate.ps1` instead.

Open `backend/.env` and replace the placeholder:

```dotenv
GROQ_API_KEY=your_groq_api_key
```

Keep this file private. The project ignores it in Git.

With the virtual environment active, start the API from the `backend` directory:

```sh
uvicorn main:app --host 127.0.0.1 --port 8000
```

Leave this terminal running. Visit `http://127.0.0.1:8000/health`; you should see `{"status":"ok"}`.

### 2. Build the extension

Open another terminal in the `browser-copilot` folder:

```sh
cd extension
npm ci
npm run build
```

The updated ZIP also includes `extension/dist`, so you can load that supplied build directly. Rebuild it whenever you change the extension's source.

### 3. Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select `browser-copilot/extension/dist`.
4. Open a regular website and click the extension icon to open the sidebar.

If the website was open before you loaded the extension, refresh it so the content script can load.

## How it works

The sidebar handles the conversation and approval controls. A content script reads page text and interactive elements, then executes approved actions. The background service worker opens the sidebar and saves page content when that site's memory is enabled.

The backend has two main paths:

- **Ask:** current page text + relevant saved passages → Groq → answer.
- **Act:** current page controls + previous steps → Groq → validated next action → user approval → execution → fresh page observation.

Saved pages are split into overlapping passages of up to 1,500 characters. Revisiting a URL replaces its old passages, and stored metadata includes the page title, URL, and visit time.

The planner returns at most one valid action per request. Navigation is limited to HTTP and HTTPS, and malformed action arguments are rejected. Page content is marked as untrusted input in the prompts, although prompt instructions alone cannot guarantee resistance to every injection attempt.

## Project structure

```text
browser-copilot/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── routes/              # Ask, actions, memory, and deletion endpoints
│   ├── services/            # Model calls and passage storage/retrieval
│   ├── tests/               # Backend tests
│   └── .env.example         # API key configuration template
├── extension/
│   ├── public/manifest.json # Chrome extension configuration
│   ├── src/
│   │   ├── background/      # Sidebar opening and opt-in memory saves
│   │   ├── content/         # Page extraction and action execution
│   │   └── sidebar/         # React interface
│   ├── tests/               # Frontend tests
│   └── dist/                # Built extension, included in the ZIP
├── BENCHMARK.md             # Manual browser evaluation checklist
└── TESTING.md               # Test instructions and coverage notes
```

The service named `gemini.py` currently uses Groq. Its filename is left over from an earlier naming choice.

## Testing

With your backend virtual environment active, run these commands from `backend`:

```sh
pip install -r requirements-dev.txt
pytest
```

From `extension`:

```sh
npm test
npx tsc --noEmit
npm run build
```

The updated version passed **62 backend tests** and **53 frontend tests**, along with TypeScript checking and a production build. Tests cover request handling, planner output validation, passage storage, extraction, selectors, and action execution.

These tests mock Groq, ChromaDB, and Chrome APIs. They don't establish real-world task completion. Use [BENCHMARK.md](BENCHMARK.md) to evaluate the extension in Chrome and record actual outcomes before reporting accuracy or reliability numbers.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| The sidebar says the backend is offline | Keep Uvicorn running on port 8000 and check the health endpoint. |
| The API starts but AI requests fail | Check your Groq key, internet connection, and the backend terminal output. |
| The assistant cannot read a page | Refresh the tab after loading the extension. Chrome's internal pages are restricted. |
| A control cannot be clicked or filled | The page may use frames, shadow DOM, or controls that reject synthetic browser events. |
| Memory doesn't contain a page | Enable memory for that site's origin. Incognito and password pages are excluded. |
| Source changes aren't visible | Run the extension build again, reload the extension in Chrome, and refresh the website. |

## Current limitations

This is a working prototype with automated component tests. It still needs live model, database, and browser evaluation.

The assistant does not work reliably with every website. Cross-origin frames, shadow DOM, dynamic widgets, and controls requiring trusted user events can prevent actions. Completion is assessed by the model using later page observations; it isn't independently verified for every kind of task. The observation loop also uses bounded waits, so slow or rapidly changing pages can fail.

Ask sends the current page's text to Groq even when memory is disabled. Site memory permissions control saving, not whether an Ask request uses an external model.

Keep the backend bound to `127.0.0.1`. Its CORS policy accepts Chrome extension origins, but CORS is not authentication against other local programs. Don't expose this API publicly without adding proper access controls.

## Next improvements

The next useful work is measuring real-browser task completion, adding stronger outcome checks for common workflows, providing a viewer for saved memory, and testing recovery on dynamic pages. Those results would be more useful than adding more actions without checking how reliably they work.
