import { defineConfig } from 'vitest/config';

/**
 * Tests run from the repository root, not from the web app's Vite root.
 * Kept separate so the app's build config and the test config cannot drift.
 */
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.spec.ts'],
    globals: true,
  },
});
