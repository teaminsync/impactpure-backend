// server/routes/shiprocketRoute.js
import express from "express";
import { generateInvoice } from "../controllers/shiprocketController.js";
import adminAuth from "../middleware/adminAuth.js";

const shiprocketRouter = express.Router();

// Only invoice generation stays routed, and only with an admin token. The backend itself calls it
// after an order is created, using a short-lived admin token it signs for that one request.
// The authenticate, serviceability and create-order routes were removed: nothing in the
// storefront or admin app uses them, and /authenticate returned a Shiprocket token to any caller.
shiprocketRouter.post("/generate-invoice", adminAuth, generateInvoice);

export default shiprocketRouter;
