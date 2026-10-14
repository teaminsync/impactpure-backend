// Razorpay checkout logic. Every dependency (models, Razorpay client, clock, sleep) is
// passed in, so the logic can be tested without a database or network.
import { normalizeItems, priceItems, sanitizeAddress } from "./orderPricing.js";
import { verifyPaymentSignature } from "./razorpaySignature.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const INTENT_KEEP_DAYS_UNPAID = 30;
export const INTENT_KEEP_DAYS_PAID = 90;

const ORDER_ID = /^order_[A-Za-z0-9]{6,40}$/;
const PAYMENT_ID = /^pay_[A-Za-z0-9]{6,40}$/;

// Step 1 of a Razorpay purchase: the server prices the cart, creates the Razorpay order
// with the server total, and remembers what was priced (the "intent").
export const createRazorpayIntent = async (
  deps,
  { userId, rawItems, rawAddress, clientAmount }
) => {
  const normalized = normalizeItems(rawItems);
  if (!normalized.ok) {
    return { ok: false, status: 400, message: normalized.message };
  }
  const cleanAddress = sanitizeAddress(rawAddress);
  if (!cleanAddress.ok) {
    return { ok: false, status: 400, message: cleanAddress.message };
  }
  const products = await deps.Product.find({
    _id: { $in: normalized.items.map((line) => line._id) },
  }).select("name price");
  const pricing = priceItems(normalized.items, products);
  if (!pricing.ok) {
    return { ok: false, status: 400, message: pricing.message };
  }
  // The browser total is only used to detect a stale price; it is never trusted.
  if (Math.round(Number(clientAmount) * 100) !== pricing.totalPaise) {
    return {
      ok: false,
      status: 400,
      message: "The order total has changed. Please refresh the page and try again.",
    };
  }

  const intentId = deps.newId();
  const razorpayOrder = await deps.razorpay.orders.create({
    amount: pricing.totalPaise,
    currency: "INR",
    receipt: "ip_" + intentId,
    notes: { intentId, userId: String(userId) },
  });
  if (
    !razorpayOrder ||
    typeof razorpayOrder.id !== "string" ||
    razorpayOrder.amount !== pricing.totalPaise
  ) {
    throw new Error("Razorpay returned an unexpected order");
  }

  await deps.Intent.create({
    _id: intentId,
    razorpayOrderId: razorpayOrder.id,
    userId,
    items: pricing.lines,
    address: cleanAddress.address,
    amountPaise: pricing.totalPaise,
    currency: "INR",
    status: "created",
    expireAt: new Date(deps.now() + INTENT_KEEP_DAYS_UNPAID * DAY_MS),
  });

  return {
    ok: true,
    razorpayOrder,
    lines: pricing.lines,
    address: cleanAddress.address,
    amountRupees: pricing.totalRupees,
  };
};

// Decides whether a Razorpay payment (as returned by Razorpay's API) settles the intent.
// A payment may be LOWER than the intent amount (a merchant-funded offer such as No Cost EMI
// is applied upfront), but never higher.
export const evaluatePayment = (intent, payment) => {
  if (!payment || typeof payment !== "object") {
    return { ok: false, reason: "no payment returned" };
  }
  if (payment.order_id !== intent.razorpayOrderId) {
    return { ok: false, reason: "payment belongs to a different order" };
  }
  if (payment.currency !== "INR") {
    return { ok: false, reason: "unexpected currency" };
  }
  if (
    !Number.isInteger(payment.amount) ||
    payment.amount <= 0 ||
    payment.amount > intent.amountPaise
  ) {
    return { ok: false, reason: "unexpected amount" };
  }
  if (payment.status === "authorized") {
    return { ok: false, retry: true, reason: "authorized but not captured yet" };
  }
  if (payment.status !== "captured" || payment.captured === false) {
    return { ok: false, reason: "payment status is " + payment.status };
  }
  return {
    ok: true,
    paidAmountPaise: payment.amount,
    discountPaise: intent.amountPaise - payment.amount,
  };
};

// Step 2: after the browser reports a payment, check the signature, ask Razorpay for the
// payment, and create the order exactly once.
export const confirmRazorpayPayment = async (
  deps,
  { userId, orderId, paymentId, signature }
) => {
  if (
    typeof orderId !== "string" ||
    !ORDER_ID.test(orderId) ||
    typeof paymentId !== "string" ||
    !PAYMENT_ID.test(paymentId) ||
    typeof signature !== "string"
  ) {
    return { ok: false, status: 400, message: "Invalid payment details." };
  }
  if (!verifyPaymentSignature(orderId, paymentId, signature, deps.keySecret)) {
    return { ok: false, status: 400, message: "Payment verification failed." };
  }

  const intent = await deps.Intent.findOne({ razorpayOrderId: orderId, userId });
  if (!intent) {
    return { ok: false, status: 404, message: "Order not found." };
  }
  const existing = await deps.Order.findOne({ razorpayOrderId: orderId });
  if (existing) {
    return { ok: true, created: false, order: existing };
  }

  let evaluation;
  for (let attempt = 1; attempt <= deps.pollAttempts; attempt++) {
    let payment;
    try {
      payment = await deps.razorpay.payments.fetch(paymentId);
    } catch (error) {
      return {
        ok: false,
        status: 502,
        message:
          "We could not confirm the payment right now. If money was deducted it will be reconciled; please contact support with your payment id.",
      };
    }
    evaluation = evaluatePayment(intent, payment);
    if (evaluation.ok || !evaluation.retry) {
      break;
    }
    if (attempt < deps.pollAttempts) {
      await deps.sleep(deps.pollDelayMs);
    }
  }
  if (!evaluation.ok) {
    if (evaluation.retry) {
      return {
        ok: false,
        status: 202,
        message: "Your payment is still being confirmed. Please check My Orders in a few minutes.",
      };
    }
    return { ok: false, status: 400, message: "Payment could not be verified." };
  }

  let order;
  try {
    order = await deps.Order.create({
      userId: intent.userId,
      items: intent.items.map((line) => ({
        product: line.product,
        quantity: line.quantity,
        name: line.name,
        price: line.unitPricePaise / 100,
      })),
      address: intent.address,
      amount: intent.amountPaise / 100,
      paymentMethod: "Razorpay",
      payment: true,
      date: deps.now(),
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      paidAmountPaise: evaluation.paidAmountPaise,
      discountPaise: evaluation.discountPaise,
    });
  } catch (error) {
    // Another request created the order first (unique index on razorpayOrderId)
    if (error && error.code === 11000) {
      const winner = await deps.Order.findOne({ razorpayOrderId: orderId });
      if (winner) {
        return { ok: true, created: false, order: winner };
      }
    }
    throw error;
  }

  try {
    await deps.Intent.updateOne(
      { _id: intent._id },
      {
        $set: {
          status: "paid",
          expireAt: new Date(deps.now() + INTENT_KEEP_DAYS_PAID * DAY_MS),
        },
      }
    );
  } catch (error) {
    // The order exists; failing to mark the intent paid must not undo that
  }

  return { ok: true, created: true, order };
};
