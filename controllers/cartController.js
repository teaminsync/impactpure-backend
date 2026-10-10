import userModel from "../models/userModel.js";

// Add products to user cart
const addToCart = async (req, res) => {
  try {
    const userId = req.userId; // Extract from middleware
    const { itemId } = req.body;

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

    let cartData = userData.cartData || {}; // Ensure cartData is always an object

    if (cartData[itemId]) {
      cartData[itemId] += 1;
    } else {
      cartData[itemId] = 1;
    }

    await userModel.findByIdAndUpdate(userId, { cartData });

    res.json({ success: true, message: "Added To Cart" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update user cart
const updateCart = async (req, res) => {
  try {
    const { itemId, quantity } = req.body; // No need to extract userId from the body

    // Log input data for debugging
    console.log("Received request to update cart:", { itemId, quantity });

    // Find the user using req.userId from middleware
    const userData = await userModel.findById(req.userId); // Get user from token
    if (!userData) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    let cartData = userData.cartData;

    // Ensure the item exists in the cart
    if (!cartData[itemId]) {
      return res
        .status(400)
        .json({ success: false, message: "Item not found in cart" });
    }

    // Update the quantity of the item
    cartData[itemId] = quantity;

    // Log cartData before saving to ensure it's updated correctly
    console.log("Updated cartData:", cartData);

    // Update the user's cart in the database
    await userModel.findByIdAndUpdate(req.userId, { cartData });

    // Respond with success
    res.json({ success: true, message: "Cart Updated" });
  } catch (error) {
    // Log error to debug
    console.error("Error updating cart:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get user cart data
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

    let cartData = userData.cartData || {}; // Ensure cartData is always an object

    res.json({ success: true, cartData });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const userId = req.userId; // Extract userId from middleware
    const { itemId } = req.body; // Get itemId to be removed

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

    // Remove the item from cart
    let cartData = userData.cartData || {}; // Ensure cartData is always an object
    delete cartData[itemId]; // Remove item from cart

    // Update the user's cart
    await userModel.findByIdAndUpdate(userId, { cartData });

    res.json({ success: true, message: "Item removed from cart" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export { addToCart, updateCart, getUserCart, removeFromCart };
