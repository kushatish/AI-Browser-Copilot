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
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    chrome.storage.local.get(['pageTitle'], (result) => {
      if (result.pageTitle) setPageTitle(result.pageTitle)
    })
    fetch(`${BACKEND_URL}/health`)
      .then(() => setBackendError(false))
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
    try {
      const pageData = await getFreshPageData()

      const response = await fetch(`${BACKEND_URL}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, dom_structure: pageData?.domStructure || {} }),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) throw new Error('Backend error')
      const data = await response.json()
      const actions: Array<{ type: string; description?: string; text?: string; selector?: string; value?: string; direction?: string }> = data.actions

      // If model returned a plain text explanation
      if (actions.length === 1 && actions[0].type === 'message') {
        addMessage(actions[0].text || 'Could not complete the action.', 'assistant')
        return
      }

      // Show planned steps
      const plan = actions.map((a, i) => `${i + 1}. ${a.description || a.type}`).join('\n')
      addMessage(`Executing ${actions.length} step(s):\n${plan}`, 'assistant', true)

      // Get active tab and execute actions one by one
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab.id) throw new Error('No active tab found')

      const results: string[] = []
      for (const action of actions) {
        if (action.type === 'message') continue
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_ACTION', action })
        if (result?.success === false) {
          const errMsg = result.error || 'Unknown error'
          results.push(`Step failed: ${action.description || action.type} — ${errMsg}`)
          addMessage(results.join('\n'), 'assistant', true)
          return
        }
        await delayForAction(action.type)
      }

      addMessage('Done.', 'assistant', true)
      setBackendError(false)
    } catch (err) {
      const isBackendErr = err instanceof TypeError || (err instanceof Error && err.name !== 'AbortError')
      if (isBackendErr) setBackendError(true)
      addMessage(
        isBackendErr
          ? 'Error executing actions. Make sure the backend is running.'
          : 'Action timed out. The page may be slow.',
        'assistant'
      )
    }
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
