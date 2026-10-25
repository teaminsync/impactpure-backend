// Last resort for errors that escape a route (bad JSON, oversized bodies, upload problems).
// Never sends stack traces, error messages or internals to the caller.
export const jsonErrorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = Number(err && (err.status || err.statusCode));
  const isMulter = !!err && err.name === "MulterError";
  const isClientError = (status >= 400 && status < 500) || isMulter;

  // Only the kind of error is logged: its message can contain parts of the request
  console.error("Request error:", err && (err.type || err.code || err.name), status || "");

  let message = "Something went wrong, please try again.";
  if (isClientError) {
    message = "Invalid request.";
    if (err && typeof err.publicMessage === "string") message = err.publicMessage;
    else if (isMulter && err.code === "LIMIT_FILE_SIZE") message = "Each image must be 5 MB or smaller.";
    else if (isMulter) message = "Invalid upload.";
  }
  res
    .status(isClientError ? (status >= 400 && status < 500 ? status : 400) : 500)
    .json({ success: false, message });
};
