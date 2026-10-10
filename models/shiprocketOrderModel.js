import mongoose from "mongoose";

const shiprocketOrderSchema = new mongoose.Schema({
  order_id: { type: String, required: true },
  channel_order_id: { type: String, required: true },
  shipment_id: { type: Number, required: true },
  status: { type: String, default: "NEW" },
  status_code: { type: Number, default: 1 },
  awb_code: { type: String, default: "" },
  courier_company_id: { type: String, default: "" },
  courier_name: { type: String, default: "" },
  new_channel: { type: Boolean, default: false },
  packaging_box_error: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const ShiprocketOrder =
  mongoose.models.ShiprocketOrder ||
  mongoose.model("ShiprocketOrder", shiprocketOrderSchema);

export default ShiprocketOrder;
