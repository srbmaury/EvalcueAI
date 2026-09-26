import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'public/vendor', 'coverage', 'playwright-report*', 'test-results', 'demo-recordings']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': ['error', { allowConstantExport: true, allowExportNames: ['isProductNavItemActive'] }],
    },
  },
  {
    // Demo recorder scripts and Playwright configs run in Node, not the browser.
    files: ['e2e-demo/**/*.{js,mjs}', 'playwright*.config.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
])
