// Verifies the signature Razorpay returns to the browser after a successful payment:
// HMAC-SHA256 of "<razorpay_order_id>|<razorpay_payment_id>" using the key secret.
import { createHmac, timingSafeEqual } from "node:crypto";

export const verifyPaymentSignature = (orderId, paymentId, signature, secret) => {
  if (
    typeof orderId !== "string" ||
    typeof paymentId !== "string" ||
    typeof signature !== "string" ||
    typeof secret !== "string" ||
    !secret
  ) {
    return false;
  }
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) {
    return false;
  }
  const expected = createHmac("sha256", secret)
    .update(orderId + "|" + paymentId)
    .digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
};
