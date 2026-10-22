import { randomInt } from "node:crypto";

// Six digit one-time code from a cryptographically secure source.
export const generateOtp = () => String(randomInt(100000, 1000000));

// Returns the 10 digit Indian mobile number or null. Accepts +91, 91 and 0 prefixes,
// spaces and hyphens. Anything else (landlines, other countries, non-text) is null.
export const normalizeIndianMobile = (value) => {
  if (typeof value !== "string") return null;
  const digits = value.replace(/[\s-]/g, "");
  const match = digits.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? match[1] : null;
};

// Format stored in the users and otps collections (with a space).
export const toStoredPhone = (tenDigits) => "+91 " + tenDigits;

// Format Twilio requires: E.164, no spaces.
export const toE164 = (tenDigits) => "+91" + tenDigits;
