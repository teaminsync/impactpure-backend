// Fixed-window rate limiting. The store is injected, so the logic is testable without a database.
// A rule is { name, identity, limit, windowSec }. Identities are hashed before they are stored,
// so the database never holds raw IP addresses, phone numbers or emails.
import { createHmac } from "node:crypto";

const SLACK_MS = 60 * 1000;

export const hashKey = (secret, name, identity) =>
  createHmac("sha256", String(secret || "")).update(name + "|" + identity).digest("hex").slice(0, 40);

// Returns { ok: true } or { ok: false, retryAfterSec, rule } or { ok: false, unavailable: true }.
// If the store fails: failOpen lets the request through ({ ok: true, degraded: true }),
// otherwise the request is refused as unavailable.
export const consume = async ({ store, now, secret, log }, rules, { failOpen }) => {
  try {
    for (const rule of rules) {
      const windowMs = rule.windowSec * 1000;
      const start = Math.floor(now / windowMs) * windowMs;
      const id = hashKey(secret, rule.name + ":" + start, rule.identity);
      const count = await store.hit(id, new Date(start + windowMs + SLACK_MS));
      if (count > rule.limit) {
        return {
          ok: false,
          rule: rule.name,
          retryAfterSec: Math.max(1, Math.ceil((start + windowMs - now) / 1000)),
        };
      }
    }
    return { ok: true };
  } catch (error) {
    if (log) log("Rate limit store failed:", error && error.message);
    return failOpen ? { ok: true, degraded: true } : { ok: false, unavailable: true };
  }
};

// Adapter over a Mongoose model with _id (string), count and expireAt (TTL index).
// One atomic upsert per hit. A rare duplicate-key race on the first hit is retried once.
export const createMongoStore = (Model) => ({
  async hit(id, expireAt) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const doc = await Model.findOneAndUpdate(
          { _id: id },
          { $inc: { count: 1 }, $setOnInsert: { expireAt } },
          { upsert: true, new: true }
        ).lean();
        return doc.count;
      } catch (error) {
        if (error && error.code === 11000 && attempt === 0) continue;
        throw error;
      }
    }
    return Infinity;
  },
});
