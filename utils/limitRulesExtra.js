// More rate limit rules (see limitRules.js): starting an order and newsletter sign-ups.
import { getClientIp } from "./clientIp.js";

const HOUR = 3600;
const DAY = 86400;

// Per logged-in user. The user id comes from the verified token, never from the request body.
export const orderStartRules = (req) => [
  {
    name: "order-start:user",
    identity: String((req && req.userId) || getClientIp(req)),
    limit: 10,
    windowSec: HOUR,
  },
];

const emailId = (value) => {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return text && text.length <= 254 && text.includes("@") ? text : "";
};

export const newsletterRules = (req) => {
  const rules = [{ name: "newsletter:ip", identity: getClientIp(req), limit: 5, windowSec: HOUR }];
  const email = emailId(req && req.body && typeof req.body === "object" ? req.body.email : undefined);
  if (email) rules.push({ name: "newsletter:email", identity: email, limit: 3, windowSec: DAY });
  return rules;
};
