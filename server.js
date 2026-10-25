import express from "express";
import cors from "cors";
import "dotenv/config";
import connectDB from "./config/mongodb.js";
import connectCloudinary from "./config/cloudinary.js";
import userRouter from "./routes/userRoute.js";
import productRouter from "./routes/productRoute.js";
import cartRouter from "./routes/cartRoute.js";
import orderRouter from "./routes/orderRoute.js";
import { newsletterRouter } from "./routes/newsletterRoutes.js";
import shiprocketRouter from "./routes/shiprocketRoute.js"; // Ensure this import is correct
import { captureRawBody } from "./utils/rawBody.js";
import { securityHeaders } from "./middleware/securityHeaders.js";
import { buildCorsOptions, parseOrigins } from "./config/cors.js";
import { jsonErrorHandler } from "./middleware/errorHandler.js";

// App Config
const app = express();
const port = process.env.PORT || 4000;
connectDB().catch((error) => console.error("MongoDB connection failed:", error.message));
connectCloudinary();

// Browsers may call the API only from the origins in CORS_ORIGINS (every origin until it is set)
const corsConfig = parseOrigins(process.env.CORS_ORIGINS);
if (corsConfig.invalid.length > 0) {
  console.warn("CORS_ORIGINS has invalid entries that are ignored:", corsConfig.invalid.join(", "));
}

app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ verify: captureRawBody }));
app.use(cors(buildCorsOptions(process.env.CORS_ORIGINS)));

// API Endpoints
app.use("/api/user", userRouter);
app.use("/api/product", productRouter);
app.use("/api/cart", cartRouter);
app.use("/api/order", orderRouter);
app.use("/api/newsletter", newsletterRouter);
app.use("/api/shiprocket", shiprocketRouter); // Register shiprocketRouter here

app.get("/", (req, res) => {
  res.send("API Working");
});

// Last resort for bad JSON, oversized bodies and upload problems: no stack traces or internals
app.use(jsonErrorHandler);

app.listen(port, () => console.log("Server started on PORT: " + port));
