import { useState, useEffect, useRef } from 'react'

const BACKEND_URL = 'http://localhost:8000'

type Mode = 'ask' | 'act'

interface Message {
  role: 'user' | 'assistant'
  content: string
  isAction?: boolean
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [pageTitle, setPageTitle] = useState('')
  const [backendError, setBackendError] = useState(false)
  const [mode, setMode] = useState<Mode>('ask')
  const cancelled = useRef(false)
  const approval = useRef<((accepted: boolean) => void) | null>(null)
  const [pendingAction, setPendingAction] = useState('')
  const [memoryEnabled, setMemoryEnabled] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chrome.storage.local.get(['pageTitle'], (result) => {
      if (result.pageTitle) setPageTitle(result.pageTitle)
    })
    fetch(`${BACKEND_URL}/health`)
      .then((response) => setBackendError(!response.ok))
      .catch(() => setBackendError(true))
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addMessage = (content: string, role: 'user' | 'assistant', isAction = false) => {
    setMessages((prev) => [...prev, { role, content, isAction }])
  }

  // ── Get fresh page data from active tab ─────────────────────────────────────

  const getFreshPageData = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab.id) return null
    try {
      const data = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' })
      if (data?.title) setPageTitle(data.title)
      if (data?.url) {
        const { memoryOrigins = [] } = await chrome.storage.local.get('memoryOrigins')
        setMemoryEnabled(!tab.incognito && memoryOrigins.includes(new URL(data.url).origin))
      }
      return data
    } catch {
      // Content script not loaded on this page (e.g. chrome:// pages)
      return null
    }
  }

  // ── Delay helper: navigation actions need longer wait for page to load ───────

  const delayForAction = (type: string) => {
    const navigationActions = ['navigate_to_url', 'go_back', 'go_forward', 'reload_page']
    const ms = navigationActions.includes(type) ? 2000 : 800
    return new Promise((r) => setTimeout(r, ms))
  }

  // ── Ask mode ────────────────────────────────────────────────────────────────

  const handleAsk = async (question: string) => {
    try {
      const pageData = await getFreshPageData()

      const response = await fetch(`${BACKEND_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question,
          page_content: pageData?.content || '',
          page_url: pageData?.url || '',
          page_title: pageData?.title || '',
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) throw new Error('Backend error')
      const data = await response.json()
      addMessage(data.answer, 'assistant')
      setBackendError(false)
    } catch {
      setBackendError(true)
      addMessage('Could not reach the backend. Make sure it is running on localhost:8000.', 'assistant')
    }
  }

  // ── Act mode ────────────────────────────────────────────────────────────────

  const handleAct = async (command: string) => {
    cancelled.current = false
    const history: Array<Record<string, unknown>> = []
    const [target] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!target?.id) { addMessage('No active tab available.', 'assistant'); return }
    const observe = async () => {
      for (let attempt = 0; attempt < 12; attempt++) {
        if (cancelled.current) throw new Error('Cancelled')
        try {
          const tab = await chrome.tabs.get(target.id!)
          if (tab.status === 'complete') {
            const data = await chrome.tabs.sendMessage(target.id!, { type: 'GET_PAGE_CONTENT' })
            if (data) return data
          }
        } catch { /* Content script may be loading after navigation. */ }
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      throw new Error('Could not read the page. It may be restricted or still loading.')
    }
    try {
      for (let step = 0; step < 12; step++) {
        const before = await observe()
        const response = await fetch(`${BACKEND_URL}/agent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, dom_structure: before.domStructure, history }),
          signal: AbortSignal.timeout(30000),
        })
        if (!response.ok) throw new Error(`Planner failed (${response.status})`)
        const { actions } = await response.json()
        if (cancelled.current) throw new Error('Cancelled')
        const action = actions?.[0]
        if (!action) throw new Error('Planner returned no valid action.')
        if (action.type === 'message') {
          addMessage(action.text || 'The planner could not verify completion.', 'assistant')
          return
        }
        // Every action is reviewable, including consequences the model may miss.
        setPendingAction(`${action.description || action.type}${action.value ? `: ${action.value}` : ''}${action.url ? ` → ${action.url}` : ''}`)
        const accepted = await new Promise<boolean>((resolve) => { approval.current = resolve })
        approval.current = null
        setPendingAction('')
        if (!accepted || cancelled.current) throw new Error('Cancelled')
        const current = await observe()
        if (current.url !== before.url) throw new Error('The page changed during approval. Please restart the command.')
        const result = await chrome.tabs.sendMessage(target.id!, { type: 'EXECUTE_ACTION', action })
        if (!result?.success) throw new Error(result?.error || 'The page did not acknowledge the action.')
        await delayForAction(action.type)
        const after = await observe()
        history.push({ action, before_url: before.url, after_url: after.url, page_changed: before.content !== after.content })
        addMessage(`Step ${step + 1}: ${action.description || action.type}. Rechecking the page…`, 'assistant', true)
        // Deterministic single-step navigation commands need no further planning.
        if (['go_back', 'go_forward', 'reload_page'].includes(action.type) && history.length === 1) {
          addMessage(`Page observed after action: ${after.title || after.url}`, 'assistant', true)
          return
        }
      }
      addMessage('Stopped at the 12-step limit. Completion has not been verified.', 'assistant')
    } catch (error) {
      addMessage(error instanceof Error ? error.message : String(error), 'assistant')
    } finally {
      approval.current = null
      setPendingAction('')
    }
  }

  const toggleMemory = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.incognito) throw new Error('Memory is disabled in incognito.')
      const data = await getFreshPageData()
      if (!data?.url) throw new Error('This page is unavailable.')
      if (data.domStructure?.sensitive) throw new Error('Memory is disabled on pages containing password fields.')
      const origin = new URL(data.url).origin
      const { memoryOrigins = [] } = await chrome.storage.local.get('memoryOrigins')
      const enabling = !memoryOrigins.includes(origin)
      await chrome.storage.local.set({ memoryOrigins: enabling ? [...memoryOrigins, origin] : memoryOrigins.filter((o: string) => o !== origin) })
      setMemoryEnabled(enabling)
      if (enabling) {
        const response = await fetch(`${BACKEND_URL}/remember`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: data.url, title: data.title, content: data.content }),
          signal: AbortSignal.timeout(30000),
        })
        if (!response.ok) throw new Error('Site enabled, but saving this page failed.')
      }
      addMessage(enabling ? 'Memory enabled for this site. Page content will be stored locally; relevant passages are sent to Groq when you ask questions.' : 'Memory disabled for this site. Previously saved pages remain until deleted.', 'assistant')
    } catch (error) { addMessage(String(error), 'assistant') }
  }

  const clearMemory = async () => {
    if (!window.confirm('Delete all saved browsing memory?')) return
    try {
      await chrome.storage.local.set({ memoryOrigins: [] })
      setMemoryEnabled(false)
      const response = await fetch(`${BACKEND_URL}/memory`, { method: 'DELETE', signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error('Could not delete saved memory.')
      addMessage('Saved memory deleted. Site memory permissions reset.', 'assistant')
    } catch (error) { addMessage(String(error), 'assistant') }
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const text = input.trim()
    setInput('')
    addMessage(text, 'user')
    setLoading(true)

    if (mode === 'ask') {
      await handleAsk(text)
    } else {
      await handleAct(text)
    }

    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage()
  }

  return (
    <div className="container">
      <div className="header">
        <span className="header-title">AI Copilot</span>
        <div className="header-right">
          {backendError && <span className="badge error">Backend offline</span>}
          {!backendError && <span className="badge ok">Connected</span>}
        </div>
      </div>

      {/* Mode Toggle */}
      <div className="mode-bar">
        <button
          className={`mode-btn ${mode === 'ask' ? 'active' : ''}`}
          onClick={() => setMode('ask')}
        >
          Ask
        </button>
        <button
          className={`mode-btn ${mode === 'act' ? 'active' : ''}`}
          onClick={() => setMode('act')}
        >
          Act
        </button>
        {pageTitle && <span className="page-label-inline">{pageTitle}</span>}
      </div>

      <div className="privacy-bar">
        <button onClick={toggleMemory} disabled={loading}>{memoryEnabled ? 'Disable site memory' : 'Enable site memory'}</button>
        <button onClick={clearMemory} disabled={loading}>Delete memory</button>
        <small>Ask sends current page text to Groq. Memory is opt-in.</small>
      </div>
      {pendingAction && <div className="approval-panel">
        <p>Approve next action: {pendingAction}</p>
        <button onClick={() => approval.current?.(true)}>Approve</button>
        <button onClick={() => { cancelled.current = true; approval.current?.(false) }}>Cancel</button>
      </div>}
      {loading && <button onClick={() => { cancelled.current = true; approval.current?.(false) }}>Stop after current action</button>}
      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            {mode === 'ask'
              ? 'Ask me anything about this page...'
              : 'Tell me what to do on this page...\ne.g. "Click the search button" or "Fill the email field with test@email.com"'}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role} ${msg.isAction ? 'action' : ''}`}>
            <span className="role">{msg.role === 'user' ? 'You' : msg.isAction ? 'Agent' : 'AI'}</span>
            <p>{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="message assistant">
            <span className="role">{mode === 'act' ? 'Agent' : 'AI'}</span>
            <p className="thinking">{mode === 'act' ? 'Planning actions...' : 'Thinking...'}</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === 'ask' ? 'Ask about this page...' : 'Tell me what to do...'}
          disabled={loading}
          autoFocus
        />
        <button onClick={sendMessage} disabled={loading || !input.trim()}>
          {mode === 'act' ? 'Run' : 'Send'}
        </button>
      </div>
    </div>
  )
}

export default App
