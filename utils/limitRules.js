// The rate limit rules for each route, as pure functions of the request.
import { getClientIp } from "./clientIp.js";
import { normalizeIndianMobile } from "./otpHelpers.js";

const MIN = 60;
const HOUR = 3600;
const DAY = 86400;

const body = (req) => (req && req.body && typeof req.body === "object" ? req.body : {});

const accountId = (value) => {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  if (!text || text.length > 100) return "";
  const phone = normalizeIndianMobile(text);
  return phone ? "phone:" + phone : text;
};

export const adminLoginRules = (req) => [
  { name: "admin-login:ip", identity: getClientIp(req), limit: 8, windowSec: 15 * MIN },
  { name: "admin-login:all", identity: "all", limit: 40, windowSec: HOUR },
];

export const userLoginRules = (req) => {
  const rules = [{ name: "login:ip", identity: getClientIp(req), limit: 20, windowSec: 15 * MIN }];
  const account = accountId(body(req).identifier);
  if (account) rules.push({ name: "login:account", identity: account, limit: 10, windowSec: 15 * MIN });
  return rules;
};

export const sendOtpRules = (req) => {
  const rules = [{ name: "otp-send:ip", identity: getClientIp(req), limit: 10, windowSec: HOUR }];
  const phone = normalizeIndianMobile(body(req).phoneNumber);
  if (phone) {
    rules.push({ name: "otp-send:phone-hour", identity: phone, limit: 3, windowSec: HOUR });
    rules.push({ name: "otp-send:phone-day", identity: phone, limit: 6, windowSec: DAY });
  }
  return rules;
};

export const verifyOtpRules = (req) => {
  const rules = [{ name: "otp-verify:ip", identity: getClientIp(req), limit: 30, windowSec: HOUR }];
  const phone = normalizeIndianMobile(body(req).phoneNumber);
  if (phone) rules.push({ name: "otp-verify:phone", identity: phone, limit: 10, windowSec: HOUR });
  return rules;
};

export const accountWriteRules = (req) => [
  { name: "account-write:ip", identity: getClientIp(req), limit: 10, windowSec: HOUR },
];

// Counted only when an SMS is really about to be sent
export const smsDailyRules = () => [
  { name: "sms:all", identity: "all", limit: 150, windowSec: DAY },
];
