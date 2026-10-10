// server/routes/shiprocketRoute.js
import express from "express";
import {
  authenticateShipRocket,
  checkServiceability,
  generateInvoice,
  createShiprocketOrder,
} from "../controllers/shiprocketController.js";

const shiprocketRouter = express.Router();

shiprocketRouter.post("/authenticate", authenticateShipRocket);

shiprocketRouter.get("/serviceability", checkServiceability);

shiprocketRouter.post("/generate-invoice", generateInvoice);

shiprocketRouter.post("/create-order", createShiprocketOrder);

export default shiprocketRouter;
