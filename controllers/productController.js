import fs from "node:fs";
import { v2 as cloudinary } from "cloudinary";
import productModel from "../models/productModel.js";

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;
const GENERIC_ERROR = "Something went wrong, please try again.";

const removeTempFiles = async (files) => {
  await Promise.allSettled(files.map((file) => fs.promises.unlink(file.path)));
};

// Function for adding a product
const addProduct = async (req, res) => {
  const uploaded = [];
  try {
    const { name, description, price } = req.body || {};
    const files = req.files || {};

    const images = ["image1", "image2", "image3", "image4"]
      .map((field) => files[field] && files[field][0])
      .filter((item) => item !== undefined && item !== null);
    uploaded.push(...images);

    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanDescription = typeof description === "string" ? description.trim() : "";
    const cleanPrice = Number(price);
    if (!cleanName || cleanName.length > 200 || !cleanDescription || cleanDescription.length > 5000) {
      return res.json({ success: false, message: "Please enter a valid name and description." });
    }
    if (!Number.isFinite(cleanPrice) || cleanPrice <= 0) {
      return res.json({ success: false, message: "Please enter a valid price." });
    }
    if (images.length === 0) {
      return res.json({ success: false, message: "Please add at least one image." });
    }

    let imagesUrl = await Promise.all(
      images.map(async (item) => {
        let result = await cloudinary.uploader.upload(item.path, {
          resource_type: "image",
        });
        return result.secure_url;
      })
    );

    const productData = {
      name: cleanName,
      description: cleanDescription,
      price: cleanPrice,
      image: imagesUrl,
      date: Date.now(),
    };

    const product = new productModel(productData);
    await product.save();

    res.json({ success: true, message: "Product Added" });
  } catch (error) {
    console.error("Add product failed:", error.message);
    res.json({ success: false, message: GENERIC_ERROR });
  } finally {
    await removeTempFiles(uploaded);
  }
};

// Function for listing products
const listProducts = async (req, res) => {
  try {
    const products = await productModel.find({});
    res.json({ success: true, products });
  } catch (error) {
    console.error("List products failed:", error.message);
    res.json({ success: false, message: GENERIC_ERROR });
  }
};

// Function for removing a product
const removeProduct = async (req, res) => {
  try {
    const id = (req.body || {}).id;
    if (typeof id !== "string" || !OBJECT_ID.test(id)) {
      return res.json({ success: false, message: "Invalid product." });
    }
    await productModel.findByIdAndDelete(id);
    res.json({ success: true, message: "Product Removed" });
  } catch (error) {
    console.error("Remove product failed:", error.message);
    res.json({ success: false, message: GENERIC_ERROR });
  }
};

// Function for fetching single product info
const singleProduct = async (req, res) => {
  try {
    const productId = (req.body || {}).productId;
    if (typeof productId !== "string" || !OBJECT_ID.test(productId)) {
      return res.json({ success: false, message: "Invalid product." });
    }
    const product = await productModel.findById(productId);
    res.json({ success: true, product });
  } catch (error) {
    console.error("Single product failed:", error.message);
    res.json({ success: false, message: GENERIC_ERROR });
  }
};

export { listProducts, addProduct, removeProduct, singleProduct };
