import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 300 }, // OTP expires in 5 minutes
  resendAllowedAt: { type: Date, default: Date.now }, // Controls when the next OTP can be sent
});

const Otp = mongoose.model("Otp", otpSchema);
export default Otp;
