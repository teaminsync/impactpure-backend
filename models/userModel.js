import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      match: /^\+91 [0-9]{10}$/, // Matches +91 followed by 10 digits
    },
    cartData: { type: Object, default: {} },
  },
  { minimize: false }
);

// Pre-save hook to ensure phone number always starts with +91
userSchema.pre("save", function (next) {
  if (this.phoneNumber && !this.phoneNumber.startsWith("+91")) {
    const strippedPhoneNumber = this.phoneNumber.replace("+91", "").trim();
    this.phoneNumber = `+91 ${strippedPhoneNumber}`;
  }
  next();
});

const userModel = mongoose.models.user || mongoose.model("user", userSchema);

export default userModel;
