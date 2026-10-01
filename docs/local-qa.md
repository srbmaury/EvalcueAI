# Local validation

The desktop/mobile browser suite uses deterministic API fixtures. The server E2E suite uses isolated MongoDB replica sets and tests actual API behavior. PayU tests mock provider responses; they do not perform real payments or bank mandates.

To validate the supplied demo accounts against the real API without changing existing data:

1. From `server`, run `node src/scripts/startDemoTestServer.mjs`. This creates an ephemeral database, seeds the manifest's accounts and organization memberships, and listens on `127.0.0.1:5501`. The manifest password is read internally and is never printed. External AI, payment, email, storage and telemetry credentials are removed from this process. Stop the process to discard the database.
2. From `client`, run `VITE_API_PROXY_TARGET=http://127.0.0.1:5501 npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`.
3. From `client`, run `npm run test:e2e -- --config=playwright.local-demo.config.js`.

Each demo user is tested with a separate simulated client IP, as independent users would have in practice. This prevents the ten-login-per-IP throttle from combining all 24 accounts into one client. The app's rate limiter remains enabled. The sweep checks sign-in, session restoration, authorized core pages and horizontal overflow. Interview media, assessment progression, recovery and permission edge cases are covered separately by the main browser suite.

Do not point this harness at a production database. Do not commit reports or screenshots containing credentials. The demo QA report directory is ignored by Git.
