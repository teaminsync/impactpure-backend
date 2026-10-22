// CORS allow-list from the CORS_ORIGINS environment variable (comma separated origins).
// Unset or no valid entry: returns undefined, so cors(undefined) behaves exactly like cors().
const ORIGIN = /^https?:\/\/[^\s/]+$/i;

export const parseOrigins = (value) => {
  const valid = [];
  const invalid = [];
  if (typeof value !== "string") return { valid, invalid };
  for (const raw of value.split(",")) {
    const entry = raw.trim().replace(/\/+$/, "");
    if (!entry) continue;
    if (ORIGIN.test(entry)) valid.push(entry.toLowerCase());
    else invalid.push(raw.trim());
  }
  return { valid, invalid };
};

export const buildCorsOptions = (value) => {
  const { valid } = parseOrigins(value);
  if (valid.length === 0) return undefined;
  const allowed = new Set(valid);
  return {
    // Requests with no Origin header (server to server, the webhook, curl) are not browser calls
    origin: (origin, callback) =>
      callback(null, !origin || allowed.has(String(origin).toLowerCase())),
    maxAge: 600,
  };
};
