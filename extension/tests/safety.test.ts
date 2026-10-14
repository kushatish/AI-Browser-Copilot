import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeAction, extractPageText, getUniqueSelector } from '../src/content/index'

beforeEach(() => { document.body.innerHTML = '' })

describe('action safety and extraction regressions', () => {
  it('rejects executable navigation URLs', () => {
    expect(() => executeAction({ type: 'navigate_to_url', url: 'javascript:alert(1)' })).toThrow('Only HTTP(S)')
  })
  it('rejects unknown actions', () => {
    expect(() => executeAction({ type: 'invented' })).toThrow('Unsupported action')
  })
  it('does not explicitly resubmit after a button click', () => {
    document.body.innerHTML = '<form><button type="button" id="x">Open menu</button></form>'
    const submit = vi.spyOn(document.querySelector('form')!, 'requestSubmit')
    executeAction({ type: 'click_element', selector: '#x' })
    expect(submit).not.toHaveBeenCalled()
  })
  it('does not reintroduce scripts on short pages', () => {
    document.body.innerHTML = '<p>Short</p><script>secret_instruction()</script>'
    expect(extractPageText()).not.toContain('secret_instruction')
  })
  it('distinguishes fields with duplicated names', () => {
    document.body.innerHTML = '<form><input name="email"><input name="email"></form>'
    for (const input of document.querySelectorAll('input')) {
      const selector = getUniqueSelector(input)
      expect(document.querySelectorAll(selector)).toHaveLength(1)
      expect(document.querySelector(selector)).toBe(input)
    }
  })
  it('waits for clipboard failures rather than reporting success', async () => {
    document.body.innerHTML = '<p id="text">Copy me</p>'
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
    await expect(executeAction({ type: 'copy_text', selector: '#text' })).rejects.toThrow('Denied')
  })
})
