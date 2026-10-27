import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
export default defineConfig({ plugins: [vue()], test: { environment: 'node', include: ['tests/unit/**/*.test.ts'], coverage: { provider: 'v8', include: ['components/**/*.vue', 'extension.config.ts', 'shared/**/*.ts', 'server/**/*.ts', 'i18n/**/*.ts'], thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 } } } })
