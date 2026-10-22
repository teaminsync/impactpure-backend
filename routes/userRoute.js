import express from "express";
import {
  loginUser,
  registerUser,
  adminLogin,
  sendOtp,
  verifyOtp,
  resetPassword,
  getUserProfile,
} from "../controllers/userController.js";
import authUser from "../middleware/auth.js"; // Import the authentication middleware
import {
  accountWriteLimit,
  adminLoginLimit,
  sendOtpLimit,
  userLoginLimit,
  verifyOtpLimit,
} from "../middleware/limiters.js";

const userRouter = express.Router();

// User routes
userRouter.post("/register", accountWriteLimit, registerUser); // User registration
userRouter.post("/login", userLoginLimit, loginUser); // User login
userRouter.post("/send-otp", sendOtpLimit, sendOtp); // Send OTP for phone verification
userRouter.post("/verify-otp", verifyOtpLimit, verifyOtp); // Verify OTP for phone verification
userRouter.post("/reset-password", accountWriteLimit, resetPassword); // Reset password
userRouter.get("/profile", authUser, getUserProfile); // Add this new route

// Admin route
userRouter.post("/admin", adminLoginLimit, adminLogin); // Admin login

export default userRouter;
