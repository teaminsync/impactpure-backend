import validator from "validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createHash, timingSafeEqual } from "node:crypto";
import userModel from "../models/userModel.js";
import otpModel from "../models/otpModel.js";
import twilio from "twilio";
import { sendWelcomeEmail } from "../utils/emailService.js";

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

// Short-lived proof that a phone number passed OTP verification
const createPhoneToken = (phoneNumber) => {
  return jwt.sign({ phoneVerified: phoneNumber }, process.env.JWT_SECRET, { expiresIn: "15m" });
};

const checkPhoneToken = (token, phoneNumber) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
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
const loginUser = async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const isEmail = validator.isEmail(identifier);
    const strippedPhoneNumber =
      !isEmail && identifier.startsWith("+91")
        ? identifier.replace("+91", "").trim()
        : identifier;

    const formattedPhoneNumber =
      !isEmail && identifier.startsWith("+91")
        ? identifier
        : `+91 ${strippedPhoneNumber}`;

    const user = await userModel.findOne({
      $or: [
        { email: isEmail ? identifier : null },
        { phoneNumber: isEmail ? null : formattedPhoneNumber },
      ],
    });

    if (!user) {
      return res.json({ success: false, message: "User doesn't exist" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (isMatch) {
      const token = createToken(user._id);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
  }
};

// User registration
const registerUser = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, verificationToken } = req.body;

    // Remove +91 prefix and trim spaces
    const strippedPhoneNumber = phoneNumber.replace("+91", "").trim();
    const phoneRegex = /^[0-9]{10}$/;

    // Validate phone number
    if (!phoneRegex.test(strippedPhoneNumber)) {
      return res.json({
        success: false,
        message: "Invalid phone number format",
      });
    }

    // Format phone number with +91 prefix
    const formattedPhoneNumber = phoneNumber.startsWith("+91")
      ? phoneNumber
      : `+91 ${strippedPhoneNumber}`;

    // Require proof that this phone number passed OTP verification
    if (!checkPhoneToken(verificationToken, `+91 ${strippedPhoneNumber}`)) {
      return res.json({ success: false, message: "Phone number not verified" });
    }

    // Check if user already exists with email or phone number
    const exists = await userModel.findOne({
      $or: [{ email }, { phoneNumber: formattedPhoneNumber }],
    });

    if (exists) {
      return res.json({ success: false, message: "User already exists" });
    }

    // Validate email format
    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: "Invalid email format" });
    }

    // Check password length
    if (password.length < 8) {
      return res.json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // Hash the password securely
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new userModel({
      name,
      email,
      password: hashedPassword,
      phoneNumber: formattedPhoneNumber,
    });

    const user = await newUser.save();

    // Send welcome email asynchronously
    sendWelcomeEmail(user.email, user.name)
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
  const { phoneNumber } = req.body;

  try {
    const strippedPhoneNumber = phoneNumber.replace("+91", "").trim();
    const formattedPhoneNumber = `+91 ${strippedPhoneNumber}`;

    if (!/^[0-9]{10}$/.test(strippedPhoneNumber)) {
      return res.json({ success: false, message: "Invalid phone number" });
    }

    const existingOtp = await otpModel.findOne({
      phoneNumber: formattedPhoneNumber,
    });

    if (existingOtp) {
      const currentTime = new Date();
      if (currentTime < existingOtp.resendAllowedAt) {
        const waitTime = Math.ceil(
          (existingOtp.resendAllowedAt - currentTime) / 1000
        );
        return res.json({
          success: false,
          message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
        });
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const resendAllowedAt = new Date(Date.now() + 30 * 1000); // 30 seconds later

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

    await client.messages.create({
      body: `Hello! Your OTP for verifying your IMPACTPURE account is ${otp}. It is valid for 5 minutes. Please use it to complete your registration.`,
      from: process.env.TWILIO_PHONE,
      to: formattedPhoneNumber,
    });

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// Verify OTP
const verifyOtp = async (req, res) => {
  const { phoneNumber, otp } = req.body;

  try {
    const strippedPhoneNumber = phoneNumber.replace("+91", "").trim();
    const formattedPhoneNumber = `+91 ${strippedPhoneNumber}`;

    // Count this attempt atomically on the newest OTP for the phone number
    const otpEntry = await otpModel.findOneAndUpdate(
      { phoneNumber: formattedPhoneNumber },
      { $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: -1 } }
    );

    if (!otpEntry) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    if (otpEntry.attempts > 5) {
      await otpModel.deleteOne({ _id: otpEntry._id });
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
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "OTP verification failed" });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  const { phoneNumber, newPassword, verificationToken } = req.body;

  try {
    const strippedPhoneNumber = phoneNumber.replace("+91", "").trim();
    const formattedPhoneNumber = `+91 ${strippedPhoneNumber}`;

    // Require proof that this phone number passed OTP verification
    if (!checkPhoneToken(verificationToken, formattedPhoneNumber)) {
      return res.json({ success: false, message: "Phone number not verified" });
    }

    const user = await userModel.findOne({ phoneNumber: formattedPhoneNumber });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    if (newPassword.length < 8) {
      return res.json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
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
};
