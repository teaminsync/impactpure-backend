// server/routes/shiprocketRoute.js
import express from "express";
import { generateInvoice } from "../controllers/shiprocketController.js";

const shiprocketRouter = express.Router();

// Only invoice generation stays routed (it is called internally after an order is created).
// The authenticate, serviceability and create-order routes were removed: nothing in the
// storefront or admin app uses them, and /authenticate returned a Shiprocket token to any caller.
shiprocketRouter.post("/generate-invoice", generateInvoice);

export default shiprocketRouter;
