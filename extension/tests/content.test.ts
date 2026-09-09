/**
 * Unit tests for extension/src/content/index.ts
 *
 * Tests the four exported utility functions:
 *   - getUniqueSelector  – CSS selector generation
 *   - extractPageText    – page text extraction
 *   - extractInteractiveElements – DOM scraping for inputs/buttons/links
 *   - executeAction      – browser action execution
 *
 * Chrome APIs are mocked globally in tests/setup.ts.
 * jsdom provides the DOM environment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getUniqueSelector,
  extractPageText,
  extractInteractiveElements,
  executeAction,
} from '../src/content/index'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create an element with attributes and append it to document.body. */
function appendEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {}
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  document.body.appendChild(el)
  return el
}

/** Reset the DOM before each test so tests don't affect each other. */
beforeEach(() => {
  document.body.innerHTML = ''
  document.title = ''
  document.head.innerHTML = ''
})

// ── getUniqueSelector ─────────────────────────────────────────────────────────

describe('getUniqueSelector', () => {
  it('returns #id when element has an id', () => {
    const el = appendEl('div', { id: 'my-button' })
    expect(getUniqueSelector(el)).toBe('#my-button')
  })

  it('returns [name=...] when element has a name attribute and no id', () => {
    const el = appendEl('input', { name: 'email', type: 'email' })
    expect(getUniqueSelector(el)).toBe('[name="email"]')
  })

  it('returns bare tag when element is unique in parent', () => {
    document.body.innerHTML = '<div><span></span></div>'
    const span = document.querySelector('span')!
    const selector = getUniqueSelector(span)
    expect(document.querySelector(selector)).toBe(span)
  })

  it('uses nth-of-type when multiple siblings of same tag exist', () => {
    document.body.innerHTML = `
      <ul>
        <li>First</li>
        <li id="target">Second</li>
        <li>Third</li>
      </ul>`
    const target = document.getElementById('target')!
    // id takes priority over nth-of-type
    expect(getUniqueSelector(target)).toBe('#target')
  })

  it('nth-of-type index selects the correct sibling when no id', () => {
    document.body.innerHTML = `
      <ul id="list">
        <li class="a">First</li>
        <li class="b">Second</li>
        <li class="c">Third</li>
      </ul>`
    const items = document.querySelectorAll('li')
    items.forEach((item) => {
      const sel = getUniqueSelector(item)
      expect(document.querySelector(sel)).toBe(item)
    })
  })

  it('stops climbing when it reaches an ancestor with an id', () => {
    document.body.innerHTML = '<section id="hero"><div><button>Go</button></div></section>'
    const btn = document.querySelector('button')!
    const sel = getUniqueSelector(btn)
    expect(sel).toContain('#hero')
    expect(document.querySelector(sel)).toBe(btn)
  })

  it('escapes special characters in ids', () => {
    const el = appendEl('div', { id: 'my:special.id' })
    const sel = getUniqueSelector(el)
    expect(document.querySelector(sel)).toBe(el)
  })
})

// ── extractPageText ───────────────────────────────────────────────────────────

describe('extractPageText', () => {
  it('includes the page title', () => {
    document.title = 'My Test Page'
    document.body.textContent = 'body text'
    expect(extractPageText()).toContain('My Test Page')
  })

  it('includes the meta description when present', () => {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    meta.setAttribute('content', 'A great description')
    document.head.appendChild(meta)
    document.body.textContent = 'body'
    expect(extractPageText()).toContain('A great description')
  })

  it('includes body text content', () => {
    document.body.textContent = 'Hello from the body'
    expect(extractPageText()).toContain('Hello from the body')
  })

  it('strips script tags from extracted text', () => {
    document.body.innerHTML = '<p>Real content</p><script>var secret = 1</script>'
    const text = extractPageText()
    expect(text).not.toContain('var secret')
    expect(text).toContain('Real content')
  })

  it('strips style tags from extracted text', () => {
    document.body.innerHTML = '<p>Visible</p><style>.hidden { display:none }</style>'
    const text = extractPageText()
    expect(text).not.toContain('.hidden')
    expect(text).toContain('Visible')
  })

  it('truncates output to 10 000 characters', () => {
    document.body.textContent = 'X'.repeat(20_000)
    expect(extractPageText().length).toBeLessThanOrEqual(10_000)
  })

  it('returns a string even when body is empty', () => {
    document.title = 'Empty'
    const text = extractPageText()
    expect(typeof text).toBe('string')
    expect(text).toContain('Empty')
  })
})

// ── extractInteractiveElements ────────────────────────────────────────────────

describe('extractInteractiveElements', () => {
  it('returns inputs with type, id, name, placeholder', () => {
    document.body.innerHTML = `
      <input type="email" id="email-field" name="email" placeholder="Enter email" />`
    const { inputs } = extractInteractiveElements()
    expect(inputs).toHaveLength(1)
    expect(inputs[0].type).toBe('email')
    expect(inputs[0].id).toBe('email-field')
    expect(inputs[0].name).toBe('email')
    expect(inputs[0].placeholder).toBe('Enter email')
    expect(inputs[0].selector).toBeTruthy()
  })

  it('excludes hidden inputs', () => {
    document.body.innerHTML = `
      <input type="hidden" name="csrf" />
      <input type="text" name="username" />`
    const { inputs } = extractInteractiveElements()
    expect(inputs).toHaveLength(1)
    expect(inputs[0].name).toBe('username')
  })

  it('returns buttons with text and selector', () => {
    document.body.innerHTML = `<button id="submit-btn">Submit</button>`
    const { buttons } = extractInteractiveElements()
    expect(buttons).toHaveLength(1)
    expect(buttons[0].text).toBe('Submit')
    expect(buttons[0].selector).toBe('#submit-btn')
  })

  it('returns links with text, href, and selector', () => {
    document.body.innerHTML = `<a href="/about" id="about-link">About Us</a>`
    const { links } = extractInteractiveElements()
    expect(links).toHaveLength(1)
    expect(links[0].text).toBe('About Us')
    expect(links[0].href).toBe('/about')
    expect(links[0].selector).toBe('#about-link')
  })

  it('excludes anchors without href', () => {
    document.body.innerHTML = `
      <a>No href</a>
      <a href="/valid">Valid</a>`
    const { links } = extractInteractiveElements()
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('/valid')
  })

  it('limits inputs to 20 items', () => {
    document.body.innerHTML = Array.from({ length: 30 }, (_, i) =>
      `<input type="text" name="f${i}" />`
    ).join('')
    expect(extractInteractiveElements().inputs).toHaveLength(20)
  })

  it('limits buttons to 20 items', () => {
    document.body.innerHTML = Array.from({ length: 25 }, (_, i) =>
      `<button>Btn ${i}</button>`
    ).join('')
    expect(extractInteractiveElements().buttons).toHaveLength(20)
  })

  it('limits links to 15 items', () => {
    document.body.innerHTML = Array.from({ length: 20 }, (_, i) =>
      `<a href="/page${i}">Link ${i}</a>`
    ).join('')
    expect(extractInteractiveElements().links).toHaveLength(15)
  })

  it('button text is trimmed and capped at 60 chars', () => {
    document.body.innerHTML = `<button>${'A'.repeat(100)}</button>`
    expect(extractInteractiveElements().buttons[0].text.length).toBeLessThanOrEqual(60)
  })

  it('returns empty arrays when page has no interactive elements', () => {
    document.body.innerHTML = '<p>Just a paragraph.</p>'
    const result = extractInteractiveElements()
    expect(result.inputs).toHaveLength(0)
    expect(result.buttons).toHaveLength(0)
    expect(result.links).toHaveLength(0)
  })
})

// ── executeAction ─────────────────────────────────────────────────────────────

describe('executeAction', () => {
  describe('click_element', () => {
    it('throws when element not found', () => {
      expect(() =>
        executeAction({ type: 'click_element', selector: '#nonexistent' })
      ).toThrow('Element not found')
    })

    it('calls click() on the target element', () => {
      document.body.innerHTML = '<button id="go">Go</button>'
      const btn = document.getElementById('go')!
      const clickSpy = vi.spyOn(btn, 'click')
      executeAction({ type: 'click_element', selector: '#go' })
      expect(clickSpy).toHaveBeenCalled()
    })

    it('dispatches mousedown and mouseup before click', () => {
      document.body.innerHTML = '<button id="btn">Click</button>'
      const btn = document.getElementById('btn')!
      const events: string[] = []
      btn.addEventListener('mousedown', () => events.push('mousedown'))
      btn.addEventListener('mouseup', () => events.push('mouseup'))
      btn.addEventListener('click', () => events.push('click'))
      executeAction({ type: 'click_element', selector: '#btn' })
      expect(events).toEqual(['mousedown', 'mouseup', 'click'])
    })
  })

  describe('fill_input', () => {
    it('throws when input not found', () => {
      expect(() =>
        executeAction({ type: 'fill_input', selector: '#missing', value: 'hello' })
      ).toThrow('Element not found')
    })

    it('sets the input value', () => {
      document.body.innerHTML = '<input type="text" id="q" />'
      executeAction({ type: 'fill_input', selector: '#q', value: 'cats' })
      expect((document.getElementById('q') as HTMLInputElement).value).toBe('cats')
    })

    it('dispatches input and change events', () => {
      document.body.innerHTML = '<input type="text" id="search" />'
      const input = document.getElementById('search')!
      const firedEvents: string[] = []
      input.addEventListener('input', () => firedEvents.push('input'))
      input.addEventListener('change', () => firedEvents.push('change'))
      executeAction({ type: 'fill_input', selector: '#search', value: 'dogs' })
      expect(firedEvents).toContain('input')
      expect(firedEvents).toContain('change')
    })

    it('works on textarea elements', () => {
      document.body.innerHTML = '<textarea id="ta"></textarea>'
      executeAction({ type: 'fill_input', selector: '#ta', value: 'hello world' })
      expect((document.getElementById('ta') as HTMLTextAreaElement).value).toBe('hello world')
    })
  })

  describe('press_enter', () => {
    it('throws when element not found', () => {
      expect(() =>
        executeAction({ type: 'press_enter', selector: '#ghost' })
      ).toThrow('Element not found')
    })

    it('dispatches keydown, keypress, keyup with Enter key', () => {
      document.body.innerHTML = '<input type="text" id="field" />'
      const field = document.getElementById('field')!
      const keys: string[] = []
      field.addEventListener('keydown', (e) => keys.push(e.type))
      field.addEventListener('keypress', (e) => keys.push(e.type))
      field.addEventListener('keyup', (e) => keys.push(e.type))
      executeAction({ type: 'press_enter', selector: '#field' })
      expect(keys).toEqual(['keydown', 'keypress', 'keyup'])
    })
  })

  describe('navigate_to_url', () => {
    it('throws when url is missing', () => {
      expect(() =>
        executeAction({ type: 'navigate_to_url' })
      ).toThrow('No URL provided')
    })

    it('sets window.location.href', () => {
      executeAction({ type: 'navigate_to_url', url: 'https://example.com' })
      expect(window.location.href).toContain('example.com')
    })
  })

  describe('scroll_page', () => {
    it('calls window.scrollBy with positive top for down', () => {
      const scrollSpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
      executeAction({ type: 'scroll_page', direction: 'down' })
      const callArg = scrollSpy.mock.calls[0][0] as ScrollToOptions
      expect(callArg.top).toBeGreaterThan(0)
    })

    it('calls window.scrollBy with negative top for up', () => {
      const scrollSpy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
      executeAction({ type: 'scroll_page', direction: 'up' })
      const callArg = scrollSpy.mock.calls[0][0] as ScrollToOptions
      expect(callArg.top).toBeLessThan(0)
    })
  })

  describe('scroll_to_element', () => {
    it('throws when element not found', () => {
      expect(() =>
        executeAction({ type: 'scroll_to_element', selector: '#nowhere' })
      ).toThrow('Element not found')
    })

    it('calls scrollIntoView on the target element', () => {
      document.body.innerHTML = '<div id="target">Target</div>'
      const target = document.getElementById('target')!
      const spy = vi.spyOn(target, 'scrollIntoView').mockImplementation(() => {})
      executeAction({ type: 'scroll_to_element', selector: '#target' })
      expect(spy).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })
  })

  describe('go_back', () => {
    it('calls window.history.back()', () => {
      const spy = vi.spyOn(window.history, 'back').mockImplementation(() => {})
      executeAction({ type: 'go_back' })
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('go_forward', () => {
    it('calls window.history.forward()', () => {
      const spy = vi.spyOn(window.history, 'forward').mockImplementation(() => {})
      executeAction({ type: 'go_forward' })
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('reload_page', () => {
    it('calls window.location.reload()', () => {
      const spy = vi.spyOn(window.location, 'reload').mockImplementation(() => {})
      executeAction({ type: 'reload_page' })
      expect(spy).toHaveBeenCalled()
    })
  })

  describe('select_option', () => {
    it('throws when select element not found', () => {
      expect(() =>
        executeAction({ type: 'select_option', selector: '#missing', value: 'A' })
      ).toThrow('Element not found')
    })

    it('selects option by value', () => {
      document.body.innerHTML = `
        <select id="color">
          <option value="red">Red</option>
          <option value="blue">Blue</option>
        </select>`
      executeAction({ type: 'select_option', selector: '#color', value: 'blue' })
      expect((document.getElementById('color') as HTMLSelectElement).value).toBe('blue')
    })

    it('selects option by visible text (case-insensitive)', () => {
      document.body.innerHTML = `
        <select id="size">
          <option value="s">Small</option>
          <option value="l">Large</option>
        </select>`
      executeAction({ type: 'select_option', selector: '#size', value: 'large' })
      expect((document.getElementById('size') as HTMLSelectElement).value).toBe('l')
    })

    it('throws when option value/text does not exist', () => {
      document.body.innerHTML = `
        <select id="fruit">
          <option value="apple">Apple</option>
        </select>`
      expect(() =>
        executeAction({ type: 'select_option', selector: '#fruit', value: 'mango' })
      ).toThrow('Option "mango" not found')
    })

    it('dispatches a change event after selection', () => {
      document.body.innerHTML = `
        <select id="lang">
          <option value="en">English</option>
          <option value="fr">French</option>
        </select>`
      const select = document.getElementById('lang')!
      let changeCount = 0
      select.addEventListener('change', () => changeCount++)
      executeAction({ type: 'select_option', selector: '#lang', value: 'fr' })
      expect(changeCount).toBe(1)
    })
  })
})
