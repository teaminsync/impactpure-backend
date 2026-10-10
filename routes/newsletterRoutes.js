import express from "express";
import { subscribeUser } from "../controllers/newsletterController.js";

const newsletterRouter = express.Router();

// Newsletter subscription route
newsletterRouter.post("/subscribe", subscribeUser);

export { newsletterRouter };
