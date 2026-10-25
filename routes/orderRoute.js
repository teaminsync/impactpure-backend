import express from "express";
import {
  placeOrder,
  placeOrderRazorpay,
  allOrders,
  userOrders,
  updateStatus,
  verifyRazorpay,
  razorpayWebhook,
} from "../controllers/orderController.js";
import adminAuth from "../middleware/adminAuth.js";
import authUser from "../middleware/auth.js";
import { orderStartLimit } from "../middleware/limiters.js";

const orderRouter = express.Router();

// Admin Features
orderRouter.post("/list", adminAuth, allOrders);
orderRouter.post("/status", adminAuth, updateStatus);
orderRouter.post("/place", authUser, orderStartLimit, placeOrder);
orderRouter.post("/razorpay", authUser, orderStartLimit, placeOrderRazorpay);
orderRouter.post("/userorders", authUser, userOrders);
orderRouter.post("/verifyRazorpay", authUser, verifyRazorpay);
// Razorpay calls this itself (signed, server to server), so it has no login
orderRouter.post("/razorpay-webhook", razorpayWebhook);

export default orderRouter;
