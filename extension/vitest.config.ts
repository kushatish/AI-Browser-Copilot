import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // jsdom gives us a real DOM environment (window, document, etc.)
    environment: 'jsdom',
    // Run chrome API mocks before any test file is imported
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
