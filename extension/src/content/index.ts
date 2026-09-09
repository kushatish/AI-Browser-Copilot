// ─── Selector Helper ────────────────────────────────────────────────────────

export function getUniqueSelector(el: Element): string {
  if (el.id) return `#${CSS.escape(el.id)}`
  if (el.getAttribute('name')) return `[name="${el.getAttribute('name')}"]`

  const parts: string[] = []
  let current: Element | null = el

  while (current && current !== document.body && parts.length < 4) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      parts.unshift(`#${CSS.escape(current.id)}`)
      break
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.querySelectorAll(`:scope > ${selector}`))
      if (siblings.length > 1) {
        selector += `:nth-of-type(${siblings.indexOf(current) + 1})`
      }
    }
    parts.unshift(selector)
    current = current.parentElement
  }
  return parts.join(' > ')
}

// ─── DOM Extraction ──────────────────────────────────────────────────────────

export function extractPageText(): string {
  const title = document.title
  const metaDesc =
    document.querySelector('meta[name="description"]')?.getAttribute('content') || ''

  const clone = document.cloneNode(true) as Document
  clone.querySelectorAll('script, style, noscript').forEach((el) => el.remove())

  let text = (clone.body?.textContent || '').replace(/\s+/g, ' ').trim()

  // For very minimal pages (e.g. Google homepage), use full body text
  if (text.length < 100) {
    text = (document.body?.textContent || '').replace(/\s+/g, ' ').trim()
  }

  const parts = [`Page: ${title}`]
  if (metaDesc) parts.push(`Description: ${metaDesc}`)
  if (text) parts.push(text)

  return parts.join('\n').slice(0, 10000)
}

export function extractInteractiveElements() {
  const inputs = Array.from(
    document.querySelectorAll('input:not([type="hidden"]), textarea, select')
  )
    .slice(0, 20)
    .map((el) => ({
      type: el.getAttribute('type') || el.tagName.toLowerCase(),
      id: el.id || '',
      name: el.getAttribute('name') || '',
      placeholder: el.getAttribute('placeholder') || '',
      selector: getUniqueSelector(el),
    }))

  const buttons = Array.from(
    document.querySelectorAll(
      'button, [role="button"], input[type="submit"], input[type="button"]'
    )
  )
    .slice(0, 20)
    .map((el) => ({
      text: (el.textContent || '').trim().slice(0, 60),
      selector: getUniqueSelector(el),
    }))

  const links = Array.from(document.querySelectorAll('a[href]'))
    .slice(0, 15)
    .map((el) => ({
      text: (el.textContent || '').trim().slice(0, 60),
      href: el.getAttribute('href') || '',
      selector: getUniqueSelector(el),
    }))

  return { inputs, buttons, links }
}

// ─── Action Executor ─────────────────────────────────────────────────────────

export function executeAction(action: {
  type: string
  selector?: string
  value?: string
  direction?: string
  url?: string
}) {
  if (action.type === 'click_element') {
    const el = document.querySelector(action.selector!) as HTMLElement
    if (!el) throw new Error(`Element not found: ${action.selector}`)
    el.focus()
    // Full mouse event sequence for sites that listen to mousedown/mouseup
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    el.click()
    // Fallback: if it's a submit button, also submit the parent form
    const type = el.getAttribute('type')
    if (type === 'submit' || el.tagName === 'BUTTON') {
      const form = el.closest('form')
      if (form) form.requestSubmit()
    }
  } else if (action.type === 'fill_input') {
    const el = document.querySelector(action.selector!) as HTMLInputElement | HTMLTextAreaElement
    if (!el) throw new Error(`Element not found: ${action.selector}`)
    el.focus()
    // Use the native prototype setter so React/Vue synthetic event tracking is triggered.
    // Direct assignment (el.value = ...) bypasses framework internals and the input appears unchanged.
    const proto = el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (nativeSetter) {
      nativeSetter.call(el, action.value || '')
    } else {
      el.value = action.value || ''
    }
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (action.type === 'press_enter') {
    const el = document.querySelector(action.selector!) as HTMLElement
    if (!el) throw new Error(`Element not found: ${action.selector}`)
    el.focus()
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
    // Also try form submit
    const form = el.closest('form')
    if (form) form.requestSubmit()
  } else if (action.type === 'navigate_to_url') {
    if (!action.url) throw new Error('No URL provided')
    window.location.href = action.url
  } else if (action.type === 'select_option') {
    const el = document.querySelector(action.selector!) as HTMLSelectElement
    if (!el) throw new Error(`Element not found: ${action.selector}`)
    // Try matching by value first, then by visible text
    const option = Array.from(el.options).find(
      (o) => o.value === action.value || o.text.toLowerCase() === (action.value || '').toLowerCase()
    )
    if (!option) throw new Error(`Option "${action.value}" not found in select`)
    el.value = option.value
    el.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (action.type === 'go_back') {
    window.history.back()
  } else if (action.type === 'go_forward') {
    window.history.forward()
  } else if (action.type === 'reload_page') {
    window.location.reload()
  } else if (action.type === 'scroll_to_element') {
    const el = document.querySelector(action.selector!)
    if (!el) throw new Error(`Element not found: ${action.selector}`)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  } else if (action.type === 'copy_text') {
    const el = document.querySelector(action.selector!)
    if (!el) throw new Error(`Element not found: ${action.selector}`)
    navigator.clipboard.writeText((el as HTMLElement).innerText || el.textContent || '')
  } else if (action.type === 'scroll_page') {
    window.scrollBy({ top: action.direction === 'down' ? 600 : -600, behavior: 'smooth' })
  }
}

// ─── Message Listener (from sidebar/service worker) ──────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXECUTE_ACTION') {
    try {
      executeAction(message.action)
      sendResponse({ success: true })
    } catch (e) {
      sendResponse({ success: false, error: String(e) })
    }
  }

  // Sidebar requests fresh page content directly from this tab
  if (message.type === 'GET_PAGE_CONTENT') {
    sendResponse({
      content: extractPageText(),
      url: window.location.href,
      title: document.title,
      domStructure: extractInteractiveElements(),
    })
  }

  return true
})

// ─── Send Page Data on Load ──────────────────────────────────────────────────

function sendPageData() {
  const content = extractPageText()
  if (content.length < 50) return

  chrome.runtime.sendMessage({
    type: 'PAGE_CONTENT',
    content,
    url: window.location.href,
    title: document.title,
    domStructure: extractInteractiveElements(),
  })
}

if (document.readyState === 'complete') {
  sendPageData()
} else {
  window.addEventListener('load', sendPageData)
}
