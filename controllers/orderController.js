import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import razorpay from "razorpay";
import { createShiprocketOrder } from "./shiprocketController.js";
import productModel from "../models/productModel.js";
import {
  normalizeItems,
  priceItems,
  sanitizeAddress,
} from "../utils/orderPricing.js";
import mongoose from "mongoose";
import paymentIntentModel from "../models/paymentIntentModel.js";
import {
  createRazorpayIntent,
  confirmRazorpayPayment,
} from "../utils/razorpayOrders.js";

// global variables
const currency = "inr";
const deliveryCharge = 249;

const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Everything the Razorpay checkout logic needs, injected so it can be tested
const razorpayDeps = {
  razorpay: razorpayInstance,
  Product: productModel,
  Order: orderModel,
  Intent: paymentIntentModel,
  keySecret: process.env.RAZORPAY_KEY_SECRET,
  newId: () => new mongoose.Types.ObjectId().toString(),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollAttempts: 4,
  pollDelayMs: 1500,
};

const placeOrder = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware
    const {
      items: rawItems,
      amount: clientAmount,
      address: rawAddress,
    } = req.body;

    // Prices and totals are computed here from the database. The browser only says
    // which products and how many; its amount is used only to detect a stale price.
    const normalized = normalizeItems(rawItems);
    if (!normalized.ok) {
      return res.status(400).json({ success: false, message: normalized.message });
    }

    const cleanAddress = sanitizeAddress(rawAddress);
    if (!cleanAddress.ok) {
      return res.status(400).json({ success: false, message: cleanAddress.message });
    }

    const dbProducts = await productModel
      .find({ _id: { $in: normalized.items.map((line) => line._id) } })
      .select("name price");

    const pricing = priceItems(normalized.items, dbProducts);
    if (!pricing.ok) {
      return res.status(400).json({ success: false, message: pricing.message });
    }

    if (Math.round(Number(clientAmount) * 100) !== pricing.totalPaise) {
      return res.status(400).json({
        success: false,
        message: "The order total has changed. Please refresh the page and try again.",
      });
    }

    const items = normalized.items;
    const amount = pricing.totalRupees;
    const address = cleanAddress.address;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot place order with an empty cart.",
      });
    }

    // ✅ Convert items to store product references
    const formattedItems = items.map((item) => ({
      product: item._id, // ✅ Store only the product ID
      quantity: item.quantity,
    }));

    const orderData = {
      userId,
      items: formattedItems, // ✅ Store product references
      address,
      amount,
      paymentMethod: "COD",
      payment: false, // COD is unpaid initially
      date: Date.now(),
    };

    // Create the order in the database
    const newOrder = new orderModel(orderData);
    await newOrder.save();

    // ✅ Clear user's cart after successful order placement
    await userModel.findByIdAndUpdate(userId, { cartData: {} });

    // Call Shiprocket order creation but don't send the response yet
    await createShiprocketOrder(newOrder._id); // Don't send response here, just create the order

    // Send the response once all operations are complete
    return res.json({
      success: true,
      message: "Order Placed",
      order: newOrder,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Placing orders using Razorpay Method
const placeOrderRazorpay = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const userData = await userModel.findById(userId);
    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const { items, amount, address } = req.body;
    const result = await createRazorpayIntent(razorpayDeps, {
      userId,
      rawItems: items,
      rawAddress: address,
      clientAmount: amount,
    });
    if (!result.ok) {
      return res
        .status(result.status || 400)
        .json({ success: false, message: result.message });
    }

    // Same response shape as before so the storefront does not need to change
    res.json({
      success: true,
      order: result.razorpayOrder,
      formattedItems: result.lines,
      address: result.address,
      amount: result.amountRupees,
    });
  } catch (error) {
    console.error("Razorpay order creation failed:", error.message);
    res.status(500).json({
      success: false,
      message: "Could not start the payment. Please try again.",
    });
  }
};

const verifyRazorpay = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const result = await confirmRazorpayPayment(razorpayDeps, {
      userId,
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!result.ok) {
      return res
        .status(result.status || 400)
        .json({ success: false, message: result.message });
    }

    // Only the first confirmation clears the cart and creates the shipment
    if (result.created) {
      await userModel.findByIdAndUpdate(userId, { cartData: {} });
      await createShiprocketOrder(result.order._id);
    }

    return res.json({
      success: true,
      message: "Payment Successful, Order Placed",
      order: result.order,
    });
  } catch (error) {
    console.error("Razorpay verification failed:", error.message);
    res.status(500).json({
      success: false,
      message:
        "Could not confirm the payment. If money was deducted it will be reconciled; please contact support.",
    });
  }
};

const allOrders = async (req, res) => {
  try {
    // ✅ Fetch all orders and populate product details
    const orders = await orderModel.find({}).populate({
      path: "items.product",
      model: "product", // ✅ Ensures product details are included
      select: "name price image",
    });

    res.json({ success: true, orders });
  } catch (error) {
    console.error("❌ Error fetching all orders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const userOrders = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    // Test fetching orders without population to isolate the issue
    const orders = await orderModel.find({ userId });

    // Check if the orders and items are being returned correctly
    console.log("Orders fetched:", orders);

    if (!orders) {
      return res
        .status(404)
        .json({ success: false, message: "No orders found" });
    }

    // If you want to populate, proceed only if orders are fetched correctly
    const populatedOrders = await orderModel.find({ userId }).populate({
      path: "items.product", // Fetch product details
      select: "name price image", // Only necessary fields
    });

    res.json({ success: true, orders: populatedOrders });
  } catch (error) {
    console.log("Error fetching orders:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// update order status from Admin Panel
const updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !status) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID and status are required" });
    }

    await orderModel.findByIdAndUpdate(orderId, { status });

    res.json({ success: true, message: "Order Status Updated" });
  } catch (error) {
    console.error("❌ Error updating order status:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export {
  verifyRazorpay,
  placeOrder,
  placeOrderRazorpay,
  allOrders,
  userOrders,
  updateStatus,
  razorpayDeps,
};
