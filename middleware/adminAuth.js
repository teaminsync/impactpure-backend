import jwt from "jsonwebtoken";

const adminAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;
    if (!token) {
      return res.json({
        success: false,
        message: "Not Authorized Login Again",
      });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      decoded.role !== "admin"
    ) {
      return res.json({
        success: false,
        message: "Not Authorized Login Again",
      });
    }
    next();
  } catch (error) {
    // Do not leak verification details (expired, invalid signature) to the caller
    console.error("Admin auth failed:", error.name);
    res.json({ success: false, message: "Not Authorized Login Again" });
  }
};

export default adminAuth;
