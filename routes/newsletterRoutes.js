import express from "express";
import { subscribeUser } from "../controllers/newsletterController.js";
import { newsletterLimit } from "../middleware/limiters.js";

const newsletterRouter = express.Router();

// Newsletter subscription route
newsletterRouter.post("/subscribe", newsletterLimit, subscribeUser);

export { newsletterRouter };
