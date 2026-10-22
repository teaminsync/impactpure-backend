// Finds the caller's IP address for rate limiting.
// Vercel sets the forwarded headers itself. The LAST x-forwarded-for entry is used because
// anything the caller sends is at the front of the list. req.ip is deliberately not used.
import { isIP } from "node:net";

const clean = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return isIP(trimmed) ? trimmed : "";
};

const lastEntry = (header) => {
  const text = Array.isArray(header) ? header.join(",") : header;
  if (typeof text !== "string") return "";
  const parts = text.split(",");
  return clean(parts[parts.length - 1]);
};

export const getClientIp = (req) => {
  const headers = (req && req.headers) || {};
  return (
    lastEntry(headers["x-forwarded-for"]) ||
    lastEntry(headers["x-vercel-forwarded-for"]) ||
    clean(req && req.socket && req.socket.remoteAddress) ||
    "unknown"
  );
};
