# Test commands

Run commands from the repository root unless a section says otherwise.

## Client

```bash
cd client

# Unit tests
npm test
npm run test:watch
npm test -- src/__tests__/assessmentsPage.test.jsx

# Quality checks
npm run lint
npm run build
```

`npm test`/`test:watch`/`test:coverage` set `NODE_OPTIONS=--no-experimental-webstorage`.
Node 22+'s experimental built-in `localStorage` global shadows jsdom's own
implementation and leaves `window.localStorage` undefined otherwise. If you
invoke `vitest` directly instead of through these npm scripts, set that flag
yourself.

```bash
cd client

# All browser E2E tests
npm run test:e2e

# Desktop or mobile browser only
npx playwright test --project=desktop-chromium
npx playwright test --project=mobile-chromium

# Visible browser, slowed down for observation
npx playwright test --project=desktop-chromium --headed --workers=1
PWDEBUG=console npx playwright test --project=desktop-chromium --headed --workers=1

# Playwright Inspector and step-by-step debugging
npx playwright test --project=desktop-chromium --debug

# One file or test name
npx playwright test e2e/productJourneys.spec.js
npx playwright test e2e/productJourneys.spec.js --grep "candidate completes an assessment without seeing private feedback" --project=desktop-chromium --debug

# Open the last HTML report or trace
npx playwright show-report
npx playwright show-trace test-results/path-to-trace.zip
```

## Server

Server integration tests start an in-memory MongoDB instance.

```bash
cd server

# All, unit, integration, launch-critical, or watch mode
npm test
npm run test:unit
npm run test:e2e
npm run test:launch
npm run test:watch

# One test file or matching test name
npm test -- src/test/e2e/happyFlows.test.js
npx vitest run src/test/e2e/happyFlows.test.js -t "registers, logs in"

# Dependency security checks
npm run audit
npm run lint:deps
```

## Full local verification

```bash
(cd client && npm run lint && npm test && npm run build && npm run test:e2e)
(cd server && npm test && npm run audit)
```
