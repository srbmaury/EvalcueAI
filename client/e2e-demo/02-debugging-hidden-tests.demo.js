import { beat, caption, expect, glideTo, hideCaption, json, test, titleCard } from "./demoKit.js";

// Recording #2 from the marketing plan: a realistic multi-file bug, graded by hidden tests.
const PROCESS_ORDER = `import { chargeCard } from "../payments/client.js";
import { logger } from "../lib/logger.js";

export async function processOrder(order, { db }) {
  if (order.status === "paid") return order;

  const charge = await chargeCard({
    amount: order.total,
    currency: order.currency,
    customerId: order.customerId,
  });

  await db.orders.update(order.id, { status: "paid", chargeId: charge.id });
  logger.info("order.paid", { orderId: order.id, chargeId: charge.id });
  return { ...order, status: "paid", chargeId: charge.id };
}
`;

const PAYMENT_CLIENT = `import { withRetry } from "../lib/retry.js";
import { gateway } from "./gateway.js";

export const chargeCard = (payment) =>
  withRetry(() => gateway.charge(payment), {
    retries: 2,
    retryOn: ["ETIMEDOUT", "ECONNRESET"],
  });
`;

const GATEWAY = `export const gateway = {
  async charge({ amount, currency, customerId, idempotencyKey }) {
    const response = await fetch(process.env.GATEWAY_URL + "/charges", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: JSON.stringify({ amount, currency, customerId }),
    });
    return response.json();
  },
};
`;

const RETRY = `export async function withRetry(fn, { retries = 2, retryOn = [] } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= retries || !retryOn.includes(error.code)) throw error;
    }
  }
}
`;

const LOGGER = `export const logger = {
  info: (event, fields) => console.log(JSON.stringify({ level: "info", event, ...fields })),
};
`;

const FILES = [
    { path: "src/orders/processOrder.js", content: PROCESS_ORDER, kind: "source" },
    { path: "src/payments/client.js", content: PAYMENT_CLIENT, kind: "source" },
    { path: "src/payments/gateway.js", content: GATEWAY, kind: "source" },
    { path: "src/lib/retry.js", content: RETRY, kind: "source" },
    { path: "src/lib/logger.js", content: LOGGER, kind: "source" },
];

const INSTRUCTIONS = "Customers are occasionally charged twice for one order when the payment gateway is slow. Find the root cause and fix it.";

test("Debugging round graded by hidden tests", async ({ page }) => {
    const shareToken = "demo-debugging";
    const attemptId = "attempt-debugging";
    const endpoint = `**/api/assessments/public/${shareToken}/attempts/${attemptId}/debugging/0`;
    let files = FILES.map((file) => ({ ...file }));

    const workspace = () => ({ responseMode: "code_fix", runtime: "node-22", instructions: INSTRUCTIONS, baseFiles: FILES, files, testRuns: [] });

    await page.route("**/api/auth/refresh", (route) => json(route, { message: "Unauthenticated" }, 401));
    await page.route(`**/api/assessments/public/${shareToken}`, (route) => json(route, {
        title: "Backend debugging assessment",
        jobRole: "Backend Engineer",
        durationMinutes: 45,
        capabilities: { codeExecution: true, transcription: false, debuggingAssessments: true },
        integrity: { enabled: false },
        rounds: [{ name: "Production debugging", deliveryMode: "debugging", questionCount: 1, debugging: { responseMode: "code_fix", runtime: "node-22", sourceFileCount: FILES.length, hiddenTestCount: 3 } }],
    }));
    await page.route(`**/api/assessments/public/${shareToken}/start`, (route) => json(route, {
        attemptToken: "demo-token",
        attempt: { _id: attemptId, startedAt: new Date().toISOString(), rounds: [{ _id: "r1", name: "Production debugging", deliveryMode: "debugging", questions: [{ _id: "q1", text: INSTRUCTIONS, answer: "" }] }] },
    }, 201));
    await page.route(endpoint, (route) => json(route, workspace()));
    await page.route(`${endpoint}/workspace`, async (route) => {
        // The client saves a diff overlay, so detect the fix in the saved payload and mirror it back.
        if (route.request().method() === "PUT" && /idempotencyKey\s*:/.test(route.request().postData() || "")) {
            files = FILES.map((file) => (file.path === "src/orders/processOrder.js"
                ? { ...file, content: file.content.replace("customerId: order.customerId,\n", "customerId: order.customerId,\n    idempotencyKey: `order-${order.id}`,\n") }
                : file));
        }
        return json(route, workspace());
    });
    // Grade the edit that was actually saved: the retry-safe fix is an idempotency key on the charge.
    await page.route(`${endpoint}/run-tests`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2200));
        const fixed = /idempotencyKey\s*:/.test(files.find((file) => file.path === "src/orders/processOrder.js")?.content || "");
        return json(route, {
            status: fixed ? "passed" : "failed",
            passed: fixed ? 3 : 2,
            total: 3,
            tests: [
                { name: "charges the customer once for a new order", passed: true },
                { name: "leaves already-paid orders untouched", passed: true },
                { name: "does not double-charge when the gateway call is retried", passed: fixed },
            ],
        });
    });

    await page.goto(`/assessment/${shareToken}`);
    await titleCard(page, "The debugging interview nobody practices.", "Real multi-file code. Hidden tests. No hints.", 3600);

    await page.getByLabel("Full name").fill("Arjun Mehta");
    await page.getByLabel("Email address").fill("arjun@example.com");
    await page.getByRole("checkbox").first().check();
    await glideTo(page, page.getByRole("button", { name: "Start assessment" }));

    await expect(page.getByRole("heading", { name: INSTRUCTIONS })).toBeVisible();
    await caption(page, "A production bug report", "Double charges, only when the payment gateway is slow.", 3200);
    await hideCaption(page);

    await caption(page, "Step 1: reproduce", "Run the hidden test suite first. You can't see the tests, only their names.", 0);
    await glideTo(page, page.getByRole("button", { name: "Run tests" }));
    await expect(page.getByText("2/3 tests passed")).toBeVisible({ timeout: 15000 });
    await hideCaption(page);
    await glideTo(page, page.getByText("does not double-charge when the gateway call is retried"), { click: false, hover: 1800 });

    await caption(page, "Step 2: follow the retry path", "", 0);
    await glideTo(page, page.getByRole("button", { name: "src/payments/client.js" }));
    await beat(page, 2600);
    await hideCaption(page);
    await glideTo(page, page.getByRole("button", { name: "src/payments/gateway.js" }));
    await caption(page, "The gateway supports an idempotency key…", "…but nobody passes one. A timed-out success gets charged again.", 3600);
    await hideCaption(page);

    await caption(page, "Step 3: fix the root cause, not the symptom", "", 0);
    await glideTo(page, page.getByRole("button", { name: "src/orders/processOrder.js" }));
    await beat(page, 900);
    const anchorLine = page.locator(".monaco-editor .view-line", { hasText: "customerId: order.customerId," });
    await glideTo(page, anchorLine);
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("idempotencyKey: `order-${order.id}`,", { delay: 70 });
    await glideTo(page, page.locator(".monaco-editor .view-line", { hasText: "idempotencyKey" }), { click: false, hover: 200 });
    await hideCaption(page);
    await beat(page, 2600);

    await caption(page, "Step 4: prove it", "", 0);
    await glideTo(page, page.getByRole("button", { name: "Run tests" }));
    await expect(page.getByText("3/3 tests passed")).toBeVisible({ timeout: 15000 });
    await glideTo(page, page.getByText("3/3 tests passed"), { click: false, hover: 300 });
    await caption(page, "3/3 hidden tests pass", "Root cause fixed: retries are now safe because the charge is idempotent.", 3400,
        "All three hidden tests pass. The root cause is fixed: retries are now safe, because the charge is idempotent.");
    await hideCaption(page);

    await titleCard(page, "Graded by hidden tests, like the real thing.", "Practice debugging rounds at practice.evalcueai.com", 4200);
});
