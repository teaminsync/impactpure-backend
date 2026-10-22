import { consume } from "../utils/rateLimit.js";

export const TOO_MANY = "Too many attempts. Please try again later.";
export const UNAVAILABLE = "Service temporarily unavailable. Please try again later.";

// deps: { store, secret: () => string, now?: () => number, log?: fn }
// Returns { limit, check }. limit({ rules, failOpen }) is an Express middleware;
// check(rules, { failOpen }) returns the raw result for use inside a controller.
export const makeLimiter = ({ store, secret, now = Date.now, log = console.error }) => {
  const run = (rules, options) =>
    consume({ store, now: now(), secret: secret(), log }, rules, options);

  const limit = ({ rules, failOpen }) => async (req, res, next) => {
    let result;
    try {
      result = await run(rules(req), { failOpen });
    } catch (error) {
      if (log) log("Rate limit rule failed:", error && error.message);
      result = failOpen ? { ok: true, degraded: true } : { ok: false, unavailable: true };
    }
    if (result.ok) return next();
    if (result.unavailable) {
      return res.status(503).json({ success: false, message: UNAVAILABLE });
    }
    res.setHeader("Retry-After", String(result.retryAfterSec));
    return res.status(429).json({ success: false, message: TOO_MANY });
  };

  return { limit, check: run };
};
