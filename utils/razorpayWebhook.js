// Razorpay webhook handling. A webhook is a signed server-to-server notification, so a
// payment is completed even if the customer's browser never returns to the site.
// Every dependency is passed in so the logic can be tested without a database or network.
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ORDER_ID_PATTERN,
  PAYMENT_ID_PATTERN,
  settleRazorpayPayment,
} from "./razorpayOrders.js";

const HANDLED_EVENTS = new Set(["payment.captured", "order.paid"]);

// The signature is HMAC-SHA256 of the raw request body, keyed with the webhook secret.
export const verifyWebhookSignature = (rawBody, signature, secret) => {
  if (
    !Buffer.isBuffer(rawBody) ||
    typeof signature !== "string" ||
    typeof secret !== "string" ||
    !secret
  ) {
    return false;
  }
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
};

// Returns { status, message } and, when this delivery created the order, { created, order }.
// 200 = done (or nothing to do), 400 = bad request, 503 = ask Razorpay to retry later.
export const handleRazorpayWebhook = async (deps, { rawBody, signature }) => {
  if (!deps.webhookSecret) {
    return { status: 503, message: "Webhook is not configured." };
  }
  if (!verifyWebhookSignature(rawBody, signature, deps.webhookSecret)) {
    return { status: 400, message: "Invalid signature." };
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch (error) {
    return { status: 400, message: "Invalid body." };
  }
  if (!event || typeof event !== "object" || !HANDLED_EVENTS.has(event.event)) {
    return { status: 200, message: "Event ignored." };
  }

  const payment =
    event.payload && event.payload.payment && event.payload.payment.entity;
  const orderId = payment ? payment.order_id : undefined;
  const paymentId = payment ? payment.id : undefined;
  if (
    typeof orderId !== "string" ||
    !ORDER_ID_PATTERN.test(orderId) ||
    typeof paymentId !== "string" ||
    !PAYMENT_ID_PATTERN.test(paymentId)
  ) {
    return { status: 200, message: "No payment in event." };
  }

  const intent = await deps.Intent.findOne({ razorpayOrderId: orderId });
  if (!intent) {
    return { status: 200, message: "Unknown order ignored." };
  }

  // The payload is only a pointer. Razorpay is asked for the payment itself.
  const result = await settleRazorpayPayment(deps, { intent, orderId, paymentId });
  if (result.ok) {
    return { status: 200, message: "OK", created: result.created, order: result.order };
  }
  if (result.status === 202 || result.status === 502) {
    return { status: 503, message: "Try again later." };
  }
  return { status: 200, message: "Payment not accepted." };
};
