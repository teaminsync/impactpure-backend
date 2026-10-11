// server/controllers/shiprocketController.js
import axios from "axios";
import dotenv from "dotenv";
import ShipRocketToken from "../models/shiprocketTokenModel.js"; // Import the token model
import orderModel from "../models/orderModel.js"; // Assuming you have the Order model to access the order details
import { sendInvoiceEmail } from "../utils/emailService.js";
import ShiprocketOrder from "../models/shiprocketOrderModel.js";

dotenv.config();

// Accessing environment variables
const SHIPROCKET_EMAIL = process.env.SHIPROCKET_EMAIL;
const SHIPROCKET_PASSWORD = process.env.SHIPROCKET_PASSWORD;
const SHIPROCKET_BASE_URL = process.env.SHIPROCKET_BASE_URL;
const SHIPROCKET_ORIGIN_PINCODE = process.env.SHIPROCKET_ORIGIN_PINCODE;
const SHIPROCKET_PICKUP_LOCATION = process.env.SHIPROCKET_PICKUP_LOCATION;
const SHIPROCKET_ORDER_LENGTH = process.env.SHIPROCKET_ORDER_LENGTH;
const SHIPROCKET_ORDER_BREADTH = process.env.SHIPROCKET_ORDER_BREADTH;
const SHIPROCKET_ORDER_HEIGHT = process.env.SHIPROCKET_ORDER_HEIGHT;
const SHIPROCKET_ORDER_WEIGHT = process.env.SHIPROCKET_ORDER_WEIGHT;
const BACKEND_API_BASE_URL = process.env.BACKEND_API_BASE_URL;

const checkServiceability = async (req, res) => {
  try {
    // Retrieve parameters from the query string or use default values if not provided
    const pickupPostcode =
      req.query.pickup_postcode || SHIPROCKET_ORIGIN_PINCODE; // Default if not provided
    const deliveryPostcode = req.query.delivery_postcode;
    const cod = req.query.cod; // COD value (1 or 0)
    const weight = req.query.weight || SHIPROCKET_ORDER_WEIGHT; // Default if not provided

    // Validate required parameters
    if (!pickupPostcode || !deliveryPostcode || !cod || !weight) {
      return res.status(422).json({
        success: false,
        message: "Required fields are missing.",
        errors: {
          pickup_postcode: !pickupPostcode ? "pickup_postcode is required" : "",
          delivery_postcode: !deliveryPostcode
            ? "delivery_postcode is required"
            : "",
          cod: !cod ? "cod is required" : "",
          weight: !weight ? "weight is required" : "",
        },
      });
    }

    // Try to fetch existing Shiprocket token
    let tokenRecord = await ShipRocketToken.findOne();

    // If no token is found, generate a new one
    if (!tokenRecord) {
      console.log("🔄 No Shiprocket token found. Generating a new one...");

      try {
        // Authenticate and get a new token
        const authResponse = await axios.post(
          `${SHIPROCKET_BASE_URL}/auth/login`,
          {
            email: SHIPROCKET_EMAIL,
            password: SHIPROCKET_PASSWORD,
          },
          {
            headers: { "Content-Type": "application/json" },
          }
        );

        if (!authResponse.data.token) {
          return res.status(500).json({
            success: false,
            message: "Failed to generate Shiprocket token.",
          });
        }

        // Store new token in database
        await ShipRocketToken.create({ token: authResponse.data.token });
        tokenRecord = { token: authResponse.data.token }; // Set the token from the response
      } catch (authError) {
        console.error("❌ Shiprocket Authentication Failed:", authError);
        return res.status(500).json({
          success: false,
          message: "Failed to authenticate with Shiprocket.",
          error: authError.response
            ? authError.response.data
            : authError.message,
        });
      }
    }

    // Use the available or newly generated token
    const token = tokenRecord.token;

    // Construct the request body for serviceability check
    const requestBody = {
      pickup_postcode: pickupPostcode,
      delivery_postcode: deliveryPostcode,
      cod: cod,
      weight: weight,
    };

    // Make the API call to ShipRocket for serviceability check
    const response = await axios.get(
      `${SHIPROCKET_BASE_URL}/courier/serviceability/`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        params: requestBody, // Send parameters as query string
      }
    );

    // Get the available courier companies
    const availableCourierCompanies =
      response.data.data.available_courier_companies;

    if (!availableCourierCompanies || availableCourierCompanies.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No courier companies available for the selected service.",
      });
    }

    // Find the courier with the lowest sum of freight_charge + cod_charges
    const bestCourier = availableCourierCompanies.reduce(
      (minCourier, courier) => {
        const totalCharge = courier.freight_charge + courier.cod_charges; // Sum of freight and COD charges
        if (
          !minCourier ||
          totalCharge < minCourier.freight_charge + minCourier.cod_charges
        ) {
          return courier;
        }
        return minCourier;
      },
      null
    );

    // Respond with the courier that has the lowest total charge
    res.json({
      success: true,
      message: "Serviceability checked successfully",
      data: bestCourier,
    });
  } catch (error) {
    console.error("❌ Error checking serviceability:", error);
    res.status(500).json({
      success: false,
      message: "Failed to check serviceability",
      error: error.message,
    });
  }
};

const generateInvoice = async (req, res) => {
  try {
    const { orderId } = req.body; // MongoDB Order ID

    console.log("📩 Received Order ID for Invoice:", orderId);

    if (!orderId) {
      return res
        .status(400)
        .json({ success: false, message: "Order ID is required" });
    }

    // Step 1: Fetch the Shiprocket Order linked to this orderId
    const shiprocketOrder = await ShiprocketOrder.findOne({
      channel_order_id: orderId,
    });
    if (!shiprocketOrder) {
      return res
        .status(404)
        .json({ success: false, message: "Shiprocket order not found" });
    }

    // Step 2: Fetch the order from the database to get the email
    const order = await orderModel.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Extract email from order address
    const userEmail = order.address?.email;
    if (!userEmail) {
      return res
        .status(400)
        .json({ success: false, message: "No email found in order details" });
    }

    // Step 3: Get Shiprocket API Token
    let tokenRecord = await ShipRocketToken.findOne();
    if (!tokenRecord) {
      console.log("🔄 No Shiprocket token found. Generating a new one...");
      const authResponse = await axios.post(
        `${SHIPROCKET_BASE_URL}/auth/login`,
        { email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD },
        { headers: { "Content-Type": "application/json" } }
      );
      if (!authResponse.data.token) {
        return res.status(500).json({
          success: false,
          message: "Failed to generate Shiprocket token.",
        });
      }
      tokenRecord = await ShipRocketToken.create({
        token: authResponse.data.token,
      });
    }
    const token = tokenRecord.token;

    // Step 4: Generate Invoice via Shiprocket API
    const invoiceResponse = await axios.post(
      `${SHIPROCKET_BASE_URL}/orders/print/invoice`,
      { ids: [shiprocketOrder.order_id] }, // Use Shiprocket order_id
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Extract invoice URL from response
    const invoiceUrl = invoiceResponse.data.invoice_url;
    if (!invoiceUrl) {
      return res
        .status(500)
        .json({ success: false, message: "Invoice generation failed." });
    }

    console.log("✅ Invoice Generated:", invoiceUrl);

    // Step 5: Send Invoice Email to User
    await sendInvoiceEmail(userEmail, invoiceUrl);

    res.json({
      success: true,
      message: "Invoice generated and sent to customer",
      invoiceUrl,
    });
  } catch (error) {
    console.error(
      "🚨 Error generating invoice:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({
      success: false,
      message: "Error generating invoice",
      error: error.response ? error.response.data : error.message,
    });
  }
};

const determinePaymentMethod = (order) => {
  if (order.paymentMethod === "COD") {
    return "Postpaid"; // If COD, it's postpaid
  }

  if (order.paymentMethod === "Razorpay" && order.payment === true) {
    return "Prepaid"; // If Razorpay and payment is successful, it's prepaid
  }

  return "Unknown"; // Default case (can handle other payment methods here)
};

const adjustDimensions = (quantity) => {
  const defaultLength = parseFloat(SHIPROCKET_ORDER_LENGTH); // Default length for one unit
  const defaultBreadth = parseFloat(SHIPROCKET_ORDER_BREADTH); // Default breadth for one unit
  const defaultHeight = parseFloat(SHIPROCKET_ORDER_HEIGHT); // Default height for one unit
  const defaultWeight = parseFloat(SHIPROCKET_ORDER_WEIGHT); // Default weight for one unit

  return {
    length: defaultLength, // Length remains constant
    breadth: defaultBreadth, // Breadth remains constant
    height: defaultHeight * quantity, // Height increases with quantity
    weight: defaultWeight * quantity, // Weight increases with quantity
  };
};

const createShiprocketOrder = async (orderId) => {
  try {
    // Step 1: Fetch order from MongoDB
    const order = await orderModel.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Step 2: Get Shiprocket Token
    let tokenRecord = await ShipRocketToken.findOne();
    if (!tokenRecord) {
      console.log("🔄 Generating a new Shiprocket token...");
      const authResponse = await axios.post(
        `${SHIPROCKET_BASE_URL}/auth/login`,
        { email: SHIPROCKET_EMAIL, password: SHIPROCKET_PASSWORD },
        { headers: { "Content-Type": "application/json" } }
      );
      if (!authResponse.data.token) {
        throw new Error("Failed to generate Shiprocket token");
      }
      tokenRecord = new ShipRocketToken({ token: authResponse.data.token });
      await tokenRecord.save();
    }
    const token = tokenRecord.token;

    let totalSellingPrice = 0;
    order.items.forEach((item) => {
      totalSellingPrice += item.quantity * 3969; // 3969 is the selling price of each item
    });

    const shippingCharges = order.amount - totalSellingPrice;

    // Step 3: Prepare Shiprocket Order Data
    const orderData = {
      order_id: order._id.toString(),
      order_date: new Date().toISOString(),
      pickup_location: SHIPROCKET_PICKUP_LOCATION,
      billing_customer_name: order.address.firstName,
      billing_last_name: order.address.lastName,
      billing_address: order.address.address_line1,
      billing_address_2: order.address.address_line2,
      billing_city: order.address.city,
      billing_pincode: order.address.pincode,
      billing_state: order.address.state,
      billing_country: order.address.country,
      billing_email: order.address.email,
      billing_phone: order.address.phone,
      shipping_is_billing: true,
      order_items: order.items.map((item) => ({
        name: "IMPACTPURE Portable Water Purifier", // Default placeholder for product name
        sku: "SKU-001", // Default placeholder for SKU
        units: item.quantity, // Directly using the quantity from the order
        selling_price: 3969, // Calculate price based on quantity
      })),
      payment_method: determinePaymentMethod(order),
      shipping_charges: shippingCharges,
      sub_total: order.amount - shippingCharges,
      length: adjustDimensions(order.items[0].quantity).length,
      breadth: adjustDimensions(order.items[0].quantity).breadth,
      height: adjustDimensions(order.items[0].quantity).height,
      weight: adjustDimensions(order.items[0].quantity).weight,
    };

    // Step 4: Create Shiprocket Order
    const createOrderResponse = await axios.post(
      `${SHIPROCKET_BASE_URL}/orders/create/adhoc`,
      orderData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (createOrderResponse.data.status_code === 1) {
      // Save Shiprocket Order in DB
      const shiprocketOrderData = {
        order_id: createOrderResponse.data.order_id,
        channel_order_id: order._id.toString(), // Store MongoDB Order ID
        shipment_id: createOrderResponse.data.shipment_id,
        status: createOrderResponse.data.status,
        awb_code: createOrderResponse.data.awb_code || "",
        courier_company_id: createOrderResponse.data.courier_company_id || "",
        courier_name: createOrderResponse.data.courier_name || "",
      };

      const newShiprocketOrder = new ShiprocketOrder(shiprocketOrderData);
      await newShiprocketOrder.save();

      console.log(
        "✅ Shiprocket Order Created:",
        createOrderResponse.data.order_id
      );

      // 🔥 Call Your Backend API to Generate Invoice
      await axios.post(
        `${BACKEND_API_BASE_URL}/api/shiprocket/generate-invoice`,
        { orderId: order._id.toString() },
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      throw new Error("Error creating order in Shiprocket");
    }
  } catch (error) {
    console.error("🚨 Error creating order in Shiprocket:", error);
  }
};

export {
  checkServiceability,
  generateInvoice,
  createShiprocketOrder,
};