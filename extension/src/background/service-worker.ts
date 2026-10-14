const BACKEND_URL = 'http://localhost:8000'

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  if (tab.id) {
    chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Listen for page content from content script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'PAGE_CONTENT') {
    // Truncate content before storing to stay within chrome.storage quota
    const safeContent = typeof message.content === 'string'
      ? message.content.slice(0, 50000)
      : ''

    // Store in chrome.storage for the sidebar to use
    chrome.storage.local.set({
      pageContent: safeContent,
      pageUrl: message.url,
      pageTitle: message.title,
      domStructure: message.domStructure || {},
    })

    // Respond immediately - content script doesn't use this response
    sendResponse({ success: true })

    // Memory is opt-in per origin and disabled in incognito/password pages.
    chrome.storage.local.get(['memoryOrigins'], ({ memoryOrigins = [] }) => {
      let origin: string
      try { origin = new URL(message.url).origin } catch { return }
      if (_sender.tab?.incognito || !memoryOrigins.includes(origin) || message.sensitive) return
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      fetch(`${BACKEND_URL}/remember`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: message.url, title: message.title, content: safeContent }),
        signal: controller.signal,
      }).catch(() => {}).finally(() => clearTimeout(timeoutId))
    })

    return false // sendResponse already called synchronously
  }
  return false
})
