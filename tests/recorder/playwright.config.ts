import { defineConfig } from '@playwright/test';

// Runs the recorder helper checks; tests/smoke.mjs copies this folder into the recorder as checks/.
export default defineConfig({ testDir: '.', timeout: 60_000, reporter: 'line' });
