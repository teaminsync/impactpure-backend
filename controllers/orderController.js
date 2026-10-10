import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import razorpay from "razorpay";
import { createShiprocketOrder } from "./shiprocketController.js";

// global variables
const currency = "inr";
const deliveryCharge = 249;

const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const placeOrder = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware
    const { items, amount, address } = req.body;

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
    const { items, amount, address } = req.body;

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

    const userData = await userModel.findById(userId);
    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ Convert items into references (store product IDs only)
    const formattedItems = items.map((item) => ({
      product: item._id, // ✅ Store only product ID
      quantity: item.quantity,
    }));

    const options = {
      amount: amount * 100, // Convert to paise
      currency: "INR",
      receipt: `order_${Date.now()}`, // Use a unique identifier
    };

    const order = await razorpayInstance.orders.create(options);

    res.json({ success: true, order, formattedItems, address, amount }); // ✅ Send formatted data for verification
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyRazorpay = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      items,
      amount,
      address,
    } = req.body;

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }

    // Fetch order details from Razorpay
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);

    if (orderInfo.status === "paid") {
      // ✅ Convert items to store product references
      const formattedItems = items.map((item) => ({
        product: item._id, // ✅ Store only the product ID
        quantity: item.quantity,
      }));

      // ✅ Create the order in the database
      const orderData = {
        userId,
        items: formattedItems,
        address,
        amount,
        paymentMethod: "Razorpay",
        payment: true,
        date: Date.now(),
        transactionId: razorpay_payment_id,
      };

      const newOrder = new orderModel(orderData);
      await newOrder.save();

      // ✅ Clear user's cart after successful order
      await userModel.findByIdAndUpdate(userId, { cartData: {} });

      // Call Shiprocket order creation
      await createShiprocketOrder(newOrder._id); // Don't send response here, just create the order

      // Send the response once all operations are complete
      return res.json({
        success: true,
        message: "Payment Successful, Order Placed",
        order: newOrder,
      });
    } else {
      return res.json({ success: false, message: "Payment Failed" });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
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
};
