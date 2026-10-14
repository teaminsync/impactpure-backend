import mongoose from "mongoose";

// What the server priced when a Razorpay payment was started. Used to verify the payment
// later without trusting anything the browser sends back. Rows expire automatically.
const paymentIntentSchema = new mongoose.Schema(
  {
    razorpayOrderId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    items: [
      {
        _id: false,
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "product",
          required: true,
        },
        name: { type: String },
        unitPricePaise: { type: Number, required: true },
        quantity: { type: Number, required: true },
      },
    ],
    address: { type: Object, required: true },
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: { type: String, enum: ["created", "paid"], default: "created" },
    expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { timestamps: true }
);

const paymentIntentModel =
  mongoose.models.paymentIntent ||
  mongoose.model("paymentIntent", paymentIntentSchema);

export default paymentIntentModel;
