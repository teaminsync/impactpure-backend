import mongoose from "mongoose";

// One document per rate limit bucket. Documents expire automatically.
const rateLimitSchema = new mongoose.Schema(
  {
    _id: { type: String },
    count: { type: Number },
    expireAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  },
  { versionKey: false }
);

const rateLimitModel =
  mongoose.models.rateLimit || mongoose.model("rateLimit", rateLimitSchema);

export default rateLimitModel;
