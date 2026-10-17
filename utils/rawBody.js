// Keeps the exact bytes of every JSON request body on req.rawBody.
// Razorpay signs webhooks over the raw bytes, so the body must not be re-serialised.
export const captureRawBody = (req, res, buf) => {
  req.rawBody = buf;
};
