import multer from "multer";
import { randomBytes } from "node:crypto";

// Product images only: JPG, PNG, WEBP or GIF, at most 5 MB each and 4 files per request.
// The client's file name is never used; files get a random name and are deleted after upload.
const EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const storage = multer.diskStorage({
  filename: function (req, file, callback) {
    callback(null, randomBytes(16).toString("hex") + (EXTENSIONS[file.mimetype] || ""));
  },
});

const fileFilter = (req, file, callback) => {
  if (EXTENSIONS[file.mimetype]) return callback(null, true);
  const error = new Error("Unsupported file type");
  error.status = 400;
  error.publicMessage = "Only JPG, PNG, WEBP or GIF images are allowed.";
  return callback(error);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 4, fields: 10, parts: 20 },
});

export default upload;
