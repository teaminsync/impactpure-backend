// Applies to new passwords only (register and reset). Login never applies it,
// so existing accounts with shorter passwords keep working.
export const MIN_PASSWORD_CHARS = 10;
export const MAX_PASSWORD_BYTES = 72; // bcrypt silently ignores anything beyond 72 bytes

export const checkPassword = (password) => {
  if (typeof password !== "string") {
    return { ok: false, message: "Password is required." };
  }
  if ([...password].length < MIN_PASSWORD_CHARS) {
    return { ok: false, message: "Password must be at least 10 characters long." };
  }
  if (Buffer.byteLength(password, "utf8") > MAX_PASSWORD_BYTES) {
    return {
      ok: false,
      message: "Password is too long. Use at most 72 characters (some symbols count as more than one).",
    };
  }
  return { ok: true };
};
