import validator from "validator";
import Newsletter from "../models/newsletterModel.js";
import { sendSubscriptionEmail } from "../utils/emailService.js";

// Injected so the sign-up logic can be tested without sending email
const newsletterDeps = { sendSubscriptionEmail };

// The answer is the same whether or not the address was already subscribed, and the
// confirmation email goes out only for a new subscription. This stops the form being used
// to find out who is subscribed or to flood an inbox.
const THANKS = "Thanks for subscribing! Please check your email.";

// Handle newsletter subscription
const subscribeUser = async (req, res) => {
  try {
    const raw = (req.body || {}).email;
    const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";

    if (!email || email.length > 254 || !validator.isEmail(email)) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter a valid email address." });
    }

    let isNew = false;
    const existingEmail = await Newsletter.findOne({ email });
    if (!existingEmail) {
      try {
        await new Newsletter({ email }).save();
        isNew = true;
      } catch (error) {
        // Two sign-ups at the same moment: the other one won, which is fine
        if (!(error && error.code === 11000)) throw error;
      }
    }

    if (isNew) {
      await newsletterDeps.sendSubscriptionEmail(email);
    }

    res.status(200).json({ success: true, message: THANKS });
  } catch (error) {
    console.error("Error in subscription:", error.message);
    res
      .status(500)
      .json({
        success: false,
        message: "Something went wrong, please try again.",
      });
  }
};

export { subscribeUser, newsletterDeps };
