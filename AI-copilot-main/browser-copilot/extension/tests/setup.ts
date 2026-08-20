/**
 * Global test setup — runs before every test file.
 *
 * The content script uses Chrome Extension APIs (chrome.runtime, chrome.tabs,
 * chrome.storage, chrome.action, chrome.sidePanel) which are not available in
 * jsdom. We install a minimal mock of each API so the module can be imported
 * and the functions under test can execute without errors.
 *
 * All mock functions are vi.fn() stubs so individual tests can spy on calls
 * or override behaviour with mockReturnValue / mockImplementation.
 */
import { vi, beforeEach } from 'vitest'

const chromeMock = {
  runtime: {
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(),
  },
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
    },
  },
  sidePanel: {
    open: vi.fn(),
  },
  action: {
    onClicked: {
      addListener: vi.fn(),
    },
  },
}

// Attach to globalThis so `chrome.xxx` references inside the content script resolve
;(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock

// Reset all mock call history before each test so tests don't bleed into each other
beforeEach(() => {
  vi.clearAllMocks()
})
