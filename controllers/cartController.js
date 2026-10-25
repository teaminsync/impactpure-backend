import userModel from "../models/userModel.js";

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const MAX_QUANTITY = 10;
const MAX_DISTINCT_ITEMS = 20;
const GENERIC_ERROR = "Something went wrong, please try again.";

const cleanId = (value) =>
  typeof value === "string" && OBJECT_ID.test(value.trim()) ? value.trim().toLowerCase() : null;

const invalid = (res, message) => res.status(400).json({ success: false, message });

// Only valid product ids with whole quantities of 1 to 10 are kept
const cleanCart = (cart) => {
  const out = {};
  if (cart && typeof cart === "object") {
    for (const [key, value] of Object.entries(cart)) {
      if (OBJECT_ID.test(key) && Number.isInteger(value) && value > 0 && value <= MAX_QUANTITY) {
        out[key.toLowerCase()] = value;
      }
    }
  }
  return out;
};

// Add products to user cart
const addToCart = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware
    const itemId = cleanId((req.body || {}).itemId);

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }
    if (!itemId) {
      return invalid(res, "Invalid product.");
    }

    const userData = await userModel.findById(userId);

    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const cartData = cleanCart(userData.cartData);

    if (!cartData[itemId] && Object.keys(cartData).length >= MAX_DISTINCT_ITEMS) {
      return invalid(res, "Your cart is full.");
    }
    if ((cartData[itemId] || 0) >= MAX_QUANTITY) {
      return invalid(res, "You can order at most 10 units of one item.");
    }
    cartData[itemId] = (cartData[itemId] || 0) + 1;

    await userModel.findByIdAndUpdate(userId, { cartData });

    res.json({ success: true, message: "Added To Cart" });
  } catch (error) {
    console.error("Add to cart failed:", error.message);
    res.status(500).json({ success: false, message: GENERIC_ERROR });
  }
};

// Update user cart. A quantity of 0 removes the item.
const updateCart = async (req, res) => {
  try {
    const { itemId: rawItemId, quantity } = req.body || {};
    const itemId = cleanId(rawItemId);

    if (!itemId) {
      return invalid(res, "Invalid product.");
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      return invalid(res, "Quantity must be a whole number from 0 to 10.");
    }

    // Find the user using req.userId from middleware
    const userData = await userModel.findById(req.userId); // Get user from token
    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const cartData = cleanCart(userData.cartData);

    // Ensure the item exists in the cart
    if (!cartData[itemId]) {
      return res
        .status(400)
        .json({ success: false, message: "Item not found in cart" });
    }

    if (quantity === 0) {
      delete cartData[itemId];
    } else {
      cartData[itemId] = quantity;
    }

    await userModel.findByIdAndUpdate(req.userId, { cartData });

    res.json({ success: true, message: "Cart Updated" });
  } catch (error) {
    console.error("Update cart failed:", error.message);
    res.status(500).json({ success: false, message: GENERIC_ERROR });
  }
};

// Get user cart data. Old zero or invalid entries are left out.
const getUserCart = async (req, res) => {
  try {
    const userId = req.userId; // Ensure this is extracted from middleware

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

    res.json({ success: true, cartData: cleanCart(userData.cartData) });
  } catch (error) {
    console.error("Get cart failed:", error.message);
    res.status(500).json({ success: false, message: GENERIC_ERROR });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.userId; // Extract userId from middleware
    const itemId = cleanId((req.body || {}).itemId); // Get itemId to be removed

    if (!userId) {
      return res
        .status(400)
        .json({ success: false, message: "User ID is required" });
    }
    if (!itemId) {
      return invalid(res, "Invalid product.");
    }

    const userData = await userModel.findById(userId);
    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Remove the item from cart
    const cartData = cleanCart(userData.cartData);
    delete cartData[itemId];

    await userModel.findByIdAndUpdate(userId, { cartData });

    res.json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error("Remove from cart failed:", error.message);
    res.status(500).json({ success: false, message: GENERIC_ERROR });
  }
};

export { addToCart, updateCart, getUserCart, removeFromCart };
