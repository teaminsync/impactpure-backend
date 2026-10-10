import validator from "validator";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import userModel from "../models/userModel.js";
import otpModel from "../models/otpModel.js";
import twilio from "twilio";
import { sendWelcomeEmail } from "../utils/emailService.js";

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "1h" });
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

// Admin login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      email === process.env.ADMIN_EMAIL &&
      password === process.env.ADMIN_PASSWORD
    ) {
      const token = jwt.sign(email + password, process.env.JWT_SECRET);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid credentials" });
    }
  } catch (error) {
    console.error(error);
    res.json({ success: false, message: error.message });
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
    const { name, email, password, phoneNumber } = req.body;

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

    const otpEntry = await otpModel
      .findOne({ phoneNumber: formattedPhoneNumber })
      .sort({ createdAt: -1 });

    if (!otpEntry) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    const isMatch = await bcrypt.compare(otp, otpEntry.otp);
    if (!isMatch) {
      return res.json({ success: false, message: "Incorrect OTP" });
    }

    await otpModel.deleteOne({ _id: otpEntry._id });

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ success: false, message: "OTP verification failed" });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  const { phoneNumber, newPassword } = req.body;

  try {
    const strippedPhoneNumber = phoneNumber.replace("+91", "").trim();
    const formattedPhoneNumber = `+91 ${strippedPhoneNumber}`;

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
