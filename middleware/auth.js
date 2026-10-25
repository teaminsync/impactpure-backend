import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";

const authUser = async (req, res, next) => {
    try {
        const token = req.headers.token || req.headers.authorization?.split(" ")[1]; // Supports both direct and Bearer token formats

        if (!token) {
            return res.status(401).json({ success: false, message: "Access denied. No token provided." });
        }

        // Verify token (HS256 only)
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

        if (!decoded || !decoded.id) {
            return res.status(401).json({ success: false, message: "Invalid token. Please log in again." });
        }

        // The account must still exist, and the password must not have been reset after this token was issued
        const user = await userModel.findById(decoded.id, "passwordChangedAt");
        if (!user) {
            return res.status(401).json({ success: false, message: "Invalid token. Please log in again." });
        }
        if (
            user.passwordChangedAt &&
            Number(decoded.iat) < Math.floor(new Date(user.passwordChangedAt).getTime() / 1000)
        ) {
            return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
        }

        req.userId = decoded.id; // Attach user ID to request
        next(); // Move to next middleware

    } catch (error) {
        console.error("Auth Middleware Error:", error.name);

        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
        } else if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ success: false, message: "Invalid token. Please log in again." });
        }

        return res.status(500).json({ success: false, message: "Internal Server Error." });
    }
};

export default authUser;
