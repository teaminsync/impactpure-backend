// Escapes text before it is placed inside an HTML email.
const MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export const escapeHtml = (value) =>
  String(value === undefined || value === null ? "" : value).replace(/[&<>"']/g, (c) => MAP[c]);
