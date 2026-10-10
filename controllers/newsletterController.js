import Newsletter from "../models/newsletterModel.js";
import { sendSubscriptionEmail } from "../utils/emailService.js";

// Handle newsletter subscription
const subscribeUser = async (req, res) => {
  try {
    const { email } = req.body;

    // Check if email already exists
    const existingEmail = await Newsletter.findOne({ email });
    if (existingEmail) {
      return res
        .status(400)
        .json({ success: false, message: "Email already subscribed" });
    }

    // Save email to the database
    const newSubscriber = new Newsletter({ email });
    await newSubscriber.save();

    // Send subscription confirmation email
    await sendSubscriptionEmail(email);

    res
      .status(201)
      .json({
        success: true,
        message: "Subscription successful. Check your email!",
      });
  } catch (error) {
    console.error("Error in subscription:", error);
    res
      .status(500)
      .json({
        success: false,
        message: "Something went wrong, please try again.",
      });
  }
};

export { subscribeUser };
