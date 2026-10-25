// Wires the rate limit core to the database and defines one limiter per route.
// Login style limiters fail open (a limiter outage must not lock people out of their accounts).
// OTP limiters fail closed (an outage must not turn the SMS endpoint into an open tap).
import rateLimitModel from "../models/rateLimitModel.js";
import { createMongoStore } from "../utils/rateLimit.js";
import { makeLimiter } from "./rateLimit.js";
import {
  accountWriteRules,
  adminLoginRules,
  sendOtpRules,
  smsDailyRules,
  userLoginRules,
  verifyOtpRules,
} from "../utils/limitRules.js";
import { newsletterRules, orderStartRules } from "../utils/limitRulesExtra.js";

const limiter = makeLimiter({
  store: createMongoStore(rateLimitModel),
  secret: () => process.env.JWT_SECRET || "",
});

export const adminLoginLimit = limiter.limit({ rules: adminLoginRules, failOpen: true });
export const userLoginLimit = limiter.limit({ rules: userLoginRules, failOpen: true });
export const accountWriteLimit = limiter.limit({ rules: accountWriteRules, failOpen: true });
export const sendOtpLimit = limiter.limit({ rules: sendOtpRules, failOpen: false });
export const verifyOtpLimit = limiter.limit({ rules: verifyOtpRules, failOpen: false });
export const orderStartLimit = limiter.limit({ rules: orderStartRules, failOpen: true });
export const newsletterLimit = limiter.limit({ rules: newsletterRules, failOpen: true });

// Called by the controller right before an SMS is really sent
export const smsDailyCheck = () => limiter.check(smsDailyRules(), { failOpen: false });
