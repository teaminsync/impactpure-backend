import validator from "validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import userModel from "../models/userModel.js";
import otpModel from "../models/otpModel.js";
import twilio from "twilio";
import { sendWelcomeEmail } from "../utils/emailService.js";
import {
  generateOtp,
  normalizeIndianMobile,
  toE164,
  toStoredPhone,
} from "../utils/otpHelpers.js";
import { checkPassword } from "../utils/passwordPolicy.js";
import { smsDailyCheck } from "../middleware/limiters.js";
import { TOO_MANY, UNAVAILABLE } from "../middleware/rateLimit.js";

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Everything with side effects outside the database, injected so the logic can be tested
const userDeps = { sms: client, smsDailyCheck, sendWelcomeEmail };

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// Short-lived proof that a phone number passed OTP verification
const createPhoneToken = (phoneNumber) => {
  return jwt.sign({ phoneVerified: phoneNumber }, process.env.JWT_SECRET, { expiresIn: "15m" });
};

const checkPhoneToken = (token, phoneNumber) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
    return typeof decoded === "object" && decoded !== null && decoded.phoneVerified === phoneNumber;
  } catch (error) {
    return false;
  }
};

// Fetch user profile
const getUserProfile = async (req, res) => {
  try {
    // Get the userId from the token (this is already set by the authUser middleware)
    const user = await userModel.findById(req.userId); // req.userId is from the token

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Return the user data (name, email, phoneNumber)
    res.json({
      success: true,
      user: {
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Constant-time string comparison (both sides are hashed first so lengths match)
const safeEqual = (a, b) =>
  timingSafeEqual(
    createHash("sha256").update(String(a)).digest(),
    createHash("sha256").update(String(b)).digest()
  );

// Admin login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    // Fail closed if the admin credentials are not configured or the input is not text
    if (
      !adminEmail ||
      !adminPassword ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.json({ success: false, message: "Invalid credentials" });
    }

    const emailOk = safeEqual(email, adminEmail);
    const passwordOk = safeEqual(password, adminPassword);

    if (emailOk && passwordOk) {
      const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
        expiresIn: "8h",
      });
      return res.json({ success: true, token });
    }

    return res.json({ success: false, message: "Invalid credentials" });
  } catch (error) {
    console.error("Admin login error:", error.message);
    res.json({ success: false, message: "Something went wrong, please try again." });
  }
};

// User login
// An unknown account and a wrong password get the same answer, and a password check always
// runs, so neither the message nor the timing shows which accounts exist.
const INVALID_LOGIN = "Invalid credentials";
let dummyHash;
const getDummyHash = () => {
  if (!dummyHash) dummyHash = bcrypt.hash("impactpure-timing-pad", 10);
  return dummyHash;
};

const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body || {};

    if (
      typeof identifier !== "string" ||
      typeof password !== "string" ||
      !identifier.trim() ||
      !password
    ) {
      return res.json({ success: false, message: INVALID_LOGIN });
    }

    const id = identifier.trim();
    let query = null;
    if (validator.isEmail(id)) {
      query = { email: id.toLowerCase() };
    } else {
      const phone = normalizeIndianMobile(id);
      if (phone) query = { phoneNumber: toStoredPhone(phone) };
    }

    const user = query ? await userModel.findOne(query) : null;
    const isMatch = await bcrypt.compare(
      password,
      user ? user.password : await getDummyHash()
    );

    if (!user || !isMatch) {
      return res.json({ success: false, message: INVALID_LOGIN });
    }

    return res.json({ success: true, token: createToken(user._id) });
  } catch (error) {
    console.error("Login error:", error.message);
    res.json({ success: false, message: "Something went wrong, please try again." });
  }
};

// User registration
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, verificationToken } = req.body || {};

    const phone = normalizeIndianMobile(phoneNumber);
    if (!phone) {
      return res.json({ success: false, message: "Invalid phone number format" });
    }
    const formattedPhoneNumber = toStoredPhone(phone);

    // Require proof that this phone number passed OTP verification
    if (!checkPhoneToken(verificationToken, formattedPhoneNumber)) {
      return res.json({ success: false, message: "Phone number not verified" });
    }

    if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
      return res.json({ success: false, message: "Please enter your name" });
    }

    if (typeof email !== "string" || !validator.isEmail(email.trim())) {
      return res.json({ success: false, message: "Invalid email format" });
    }
    const cleanEmail = email.trim().toLowerCase();

    const passwordCheck = checkPassword(password);
    if (!passwordCheck.ok) {
      return res.json({ success: false, message: passwordCheck.message });
    }

    // Check if user already exists with email or phone number
    const exists = await userModel.findOne({
      $or: [{ email: cleanEmail }, { phoneNumber: formattedPhoneNumber }],
    });

    if (exists) {
      return res.json({ success: false, message: "User already exists" });
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new userModel({
      name: name.trim(),
      email: cleanEmail,
      password: hashedPassword,
      phoneNumber: formattedPhoneNumber,
    });

    const user = await newUser.save();

    // Send welcome email asynchronously
    userDeps
      .sendWelcomeEmail(user.email, user.name)
      .then(() => console.log("Welcome email sent successfully"))
      .catch((error) => console.error("Error sending welcome email:", error));

    // Generate JWT token
    const token = createToken(user._id);

    // Respond with success and token
    res.json({ success: true, token });
  } catch (error) {
    console.error("Error in registration:", error);
    res.json({
      success: false,
      message: "Something went wrong, please try again.",
    });
  }
};

// Send OTP
const sendOtp = async (req, res) => {
  try {
    const phone = normalizeIndianMobile((req.body || {}).phoneNumber);
    if (!phone) {
      return res.json({ success: false, message: "Invalid phone number" });
    }
    const formattedPhoneNumber = toStoredPhone(phone);

    // The resend cooldown lives on the OTP record. Wrong guesses never delete that record,
    // so they cannot be used to skip the wait.
    const existingOtp = await otpModel.findOne({
      phoneNumber: formattedPhoneNumber,
    });

    if (existingOtp && new Date() < existingOtp.resendAllowedAt) {
      const waitTime = Math.ceil(
        (existingOtp.resendAllowedAt - new Date()) / 1000
      );
      return res.json({
        success: false,
        message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
      });
    }

    // Daily cap on real SMS sends across the whole site
    const cap = await userDeps.smsDailyCheck();
    if (!cap.ok) {
      if (cap.unavailable) {
        return res.status(503).json({ success: false, message: UNAVAILABLE });
      }
      res.setHeader("Retry-After", String(cap.retryAfterSec));
      return res.status(429).json({ success: false, message: TOO_MANY });
    }

    const otp = generateOtp();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const resendAllowedAt = new Date(Date.now() + 60 * 1000); // 60 seconds later

    if (existingOtp) {
      existingOtp.otp = hashedOtp;
      existingOtp.createdAt = Date.now();
      existingOtp.resendAllowedAt = resendAllowedAt;
      existingOtp.attempts = 0;
      await existingOtp.save();
    } else {
      await otpModel.create({
        phoneNumber: formattedPhoneNumber,
        otp: hashedOtp,
        resendAllowedAt,
      });
    }

    try {
      await userDeps.sms.messages.create({
        body: `Your IMPACTPURE verification code is ${otp}. It is valid for 5 minutes. Do not share it with anyone.`,
        from: process.env.TWILIO_PHONE,
        to: toE164(phone),
      });
    } catch (error) {
      // Only Twilio's error code and HTTP status are logged: its message can contain the phone number
      console.error(
        "Twilio send failed. code:",
        error && error.code,
        "status:",
        error && error.status
      );
      return res.status(500).json({ success: false, message: "Failed to send OTP" });
    }

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error("Send OTP error:", error.message);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body || {};
    const phone = normalizeIndianMobile(phoneNumber);
    if (!phone || (typeof otp !== "string" && typeof otp !== "number")) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }
    const formattedPhoneNumber = toStoredPhone(phone);

    // Count this attempt atomically on the newest OTP for the phone number
    const otpEntry = await otpModel.findOneAndUpdate(
      { phoneNumber: formattedPhoneNumber },
      { $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: -1 } }
    );

    if (!otpEntry) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    // The record is kept (not deleted) so the resend cooldown on it still applies
    if (otpEntry.attempts > 5) {
      return res.json({
        success: false,
        message: "Too many incorrect attempts. Please request a new OTP.",
      });
    }

    const isMatch = await bcrypt.compare(String(otp), otpEntry.otp);
    if (!isMatch) {
      return res.json({ success: false, message: "Incorrect OTP" });
    }

    await otpModel.deleteOne({ _id: otpEntry._id });

    res.json({
      success: true,
      message: "OTP verified successfully",
      verificationToken: createPhoneToken(formattedPhoneNumber),
    });
  } catch (error) {
    console.error("Verify OTP error:", error.message);
    res
      .status(500)
      .json({ success: false, message: "OTP verification failed" });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { phoneNumber, newPassword, verificationToken } = req.body || {};

    const phone = normalizeIndianMobile(phoneNumber);
    if (!phone) {
      return res.json({ success: false, message: "Invalid phone number" });
    }
    const formattedPhoneNumber = toStoredPhone(phone);

    // Require proof that this phone number passed OTP verification
    if (!checkPhoneToken(verificationToken, formattedPhoneNumber)) {
      return res.json({ success: false, message: "Phone number not verified" });
    }

    const passwordCheck = checkPassword(newPassword);
    if (!passwordCheck.ok) {
      return res.json({ success: false, message: passwordCheck.message });
    }

    const user = await userModel.findOne({ phoneNumber: formattedPhoneNumber });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error.message);
    res
      .status(500)
      .json({ success: false, message: "Failed to reset password" });
  }
};

export {
  loginUser,
  registerUser,
  adminLogin,
  sendOtp,
  verifyOtp,
  resetPassword,
  getUserProfile,
  userDeps,
};
