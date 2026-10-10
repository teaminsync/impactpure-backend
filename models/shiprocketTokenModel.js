// server/models/shiprocketTokenModel.js
import mongoose from "mongoose";

const shiprocketTokenSchema = new mongoose.Schema({
  token: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: "10d" }, // Token expires in 10 days
});

const ShipRocketToken = mongoose.model(
  "ShipRocketToken",
  shiprocketTokenSchema
);

export default ShipRocketToken;
