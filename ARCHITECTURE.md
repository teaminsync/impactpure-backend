# Backend architecture

## 1. System context

```
 Storefront (Next.js)  ──┐                                  ┌── MongoDB Atlas (db "e-commerce")
 Admin panel (Vite)    ──┼──►  Backend (Express on Vercel) ─┼── Cloudinary   (product images)
 Razorpay (webhook)    ──┘                                  ├── Razorpay     (orders, payment lookup)
                                                            ├── Twilio       (OTP SMS)
                                                            ├── Gmail SMTP   (welcome, newsletter, invoice mail)
                                                            └── Shiprocket   (shipments, invoices)
```

The backend is stateless. Everything durable is in MongoDB. It runs as one serverless function, so module-level variables live only as long as a warm instance.

## 2. Code layout

```
server.js                 app wiring, middleware order, routers, error handler
config/                   mongodb.js, cloudinary.js, cors.js (allow-list parser)
routes/                   userRoute, productRoute, cartRoute, orderRoute, newsletterRoutes, shiprocketRoute
controllers/              userController, productController, cartController, orderController,
                          newsletterController, shiprocketController
middleware/               auth (customer), adminAuth, limiters (+ rateLimit core), securityHeaders,
                          errorHandler, multer
models/                   user, otp, product, order, paymentIntent, newsletter, rateLimit,
                          shiprocketOrder, shiprocketToken
utils/                    orderPricing, razorpayOrders, razorpayWebhook, razorpaySignature, rawBody,
                          rateLimit, limitRules, limitRulesExtra, clientIp, otpHelpers, passwordPolicy,
                          shiprocketAuth, emailService, htmlEscape
```

Pattern: controllers are thin; business logic that must be testable (pricing, Razorpay settlement, webhook handling, rate limiting, Shiprocket token refresh) lives in `utils/` as functions that receive their dependencies (models, clock, HTTP clients) as arguments.

## 3. Request pipeline

Order in `server.js`:

1. `x-powered-by` disabled.
2. `securityHeaders`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Strict-Transport-Security: max-age=31536000`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, and `Cache-Control: no-store` unless already set.
3. `express.json` with a `verify` hook that keeps the exact request bytes on `req.rawBody` (needed to check Razorpay webhook signatures).
4. `cors` from `CORS_ORIGINS`. Requests with no `Origin` header (server-to-server, webhook) are always allowed; browsers are allowed only for listed origins. With the variable unset, CORS is open.
5. Routers under `/api/user`, `/api/product`, `/api/cart`, `/api/order`, `/api/newsletter`, `/api/shiprocket`; `GET /` health text.
6. `jsonErrorHandler` last: bad JSON, oversized bodies and upload errors become `{ success:false, message }` with a generic message; stack traces and error text are never sent. Only the error kind is logged.

`connectDB()` starts at load; a failed connection is logged and does not stop the process.

## 4. Authentication and sessions

| Token | Payload | Lifetime | Issued by | Checked by |
|---|---|---|---|---|
| Customer | `{ id }` | 1 hour | login, register | `middleware/auth.js` |
| Admin | `{ role: "admin" }` | 8 hours | `POST /api/user/admin` | `middleware/adminAuth.js` |
| Internal invoice | `{ role: "admin", purpose: "invoice" }` | 2 minutes | the backend, for its own call | `adminAuth` |
| Phone verification | `{ phoneVerified: "+91 …" }` | 15 minutes | `verify-otp` | `register`, `reset-password` |

- All verification pins `HS256`.
- Customer tokens travel in the `token` header (or `Authorization: Bearer`). `authUser` also requires that the user still exists and that the token was issued **after** `users.passwordChangedAt`; a password reset therefore ends every older session.
- `adminAuth` answers HTTP 200 with `{ success:false, message:"Not Authorized Login Again" }` for a missing, invalid, expired or non-admin token. The admin panel keys off that exact message.
- Admin credentials come from the environment and are compared with SHA-256 digests in constant time. If either is unset, admin login fails closed.
- Customer login runs a real bcrypt comparison even for unknown accounts (a pre-computed dummy hash) and returns one message, `Invalid credentials`, for both cases. Email is lower-cased; phone accepts `+91`, `91`, `0` prefixes, spaces and hyphens.
- Password policy (register and reset only): at least 10 characters and at most 72 bytes (bcrypt ignores bytes beyond 72). Login never applies it, so older shorter passwords still work.

## 5. Rate limiting

Fixed windows stored in MongoDB (`ratelimits`), one atomic upsert per hit. The document `_id` is a 40-character HMAC-SHA256 of `ruleName:windowStart|identity` keyed with `JWT_SECRET`, so the database never contains raw IP addresses, phone numbers or emails. Documents carry `expireAt` (window end + 60 s) and a TTL index removes them.

Client IP is the **last** `x-forwarded-for` entry (Vercel overwrites the header; earlier entries are caller-controlled).

| Limiter | Rules | If the store fails |
|---|---|---|
| Admin login | 8 / IP / 15 min; 40 / hour overall | allow |
| Customer login | 20 / IP / 15 min; 10 / account / 15 min | allow |
| Send OTP | 10 / IP / hour; 3 / phone / hour; 6 / phone / day | refuse (503) |
| Verify OTP | 30 / IP / hour; 10 / phone / hour | refuse (503) |
| Register, reset password | 10 / IP / hour (shared bucket) | allow |
| Start order (COD or Razorpay) | 10 / user / hour | allow |
| Newsletter | 5 / IP / hour; 3 / email / day | allow |
| Daily SMS cap | 150 / day site-wide, counted just before a real send | refuse (503) |

Exceeding a rule returns 429 `Too many attempts. Please try again later.` with `Retry-After`.

## 6. Data model (collection → purpose)

| Model → collection | Key fields and indexes |
|---|---|
| `user` → `users` | `name`, `email` (unique), `password` (bcrypt), `phoneNumber` (unique, `+91 dddddddddd`), `cartData` (`{productId: qty}`), `passwordChangedAt`. A pre-save hook normalises the `+91 ` prefix |
| `Otp` → `otps` | `phoneNumber`, hashed `otp`, `createdAt` (TTL 300 s), `resendAllowedAt`, `attempts` |
| `product` → `products` | `name`, `description`, `price` (rupees), `image[]` (Cloudinary URLs), `date` |
| `order` → `orders` | `userId`, `items[{ product, quantity, name, price }]`, `amount` (rupees, goods + delivery), `address`, `status`, `paymentMethod` (`COD` or `Razorpay`), `payment`, `date`, `razorpayOrderId` / `razorpayPaymentId` (unique, sparse), `paidAmountPaise`, `discountPaise`, `shipmentIssue` |
| `paymentIntent` → `paymentintents` | What the server priced when a Razorpay payment started: `razorpayOrderId` (unique), `userId`, priced `items`, `address`, `amountPaise`, `status` (`created`/`paid`), `expireAt` (TTL; 30 days unpaid, 90 days paid) |
| `Newsletter` → `newsletters` | `email` (unique, lower-cased), `subscribedAt` |
| `rateLimit` → `ratelimits` | `_id` (hash), `count`, `expireAt` (TTL) |
| `ShiprocketOrder` → `shiprocketorders` | Shiprocket `order_id`, `channel_order_id` (our order id), `shipment_id`, status, AWB and courier fields |
| `ShipRocketToken` → `shiprockettokens` | cached Shiprocket `token` (TTL 10 days) |

## 7. Core flows

### 7.1 Registration and password reset
`send-otp` → `verify-otp` → `register` / `reset-password`.
- `send-otp`: Indian mobiles only. The 60-second cooldown is stored on the OTP record (`resendAllowedAt`) and wrong guesses never delete it. The site-wide daily SMS cap is checked immediately before the Twilio call. The code is 6 digits from `crypto.randomInt`, stored bcrypt-hashed, valid 5 minutes. On a Twilio failure only the Twilio error code and HTTP status are logged (never the phone number) and the client gets a generic 500.
- `verify-otp`: each attempt atomically increments `attempts` on the newest OTP; more than 5 attempts is refused. A correct code deletes the record and returns the 15-minute `verificationToken`.
- `register` and `reset-password` require a verification token for exactly that phone number. A new password stamps `passwordChangedAt`.
- A welcome email is sent asynchronously after registration; failure does not affect the response.

### 7.2 Cart
The cart lives in `users.cartData`. Product ids must be 24-hex; quantities are whole numbers 1–10; at most 20 distinct products; quantity 0 removes a line. Every read and write passes through `cleanCart`, which drops old zero or invalid entries.

### 7.3 Pricing (all server-side)
The browser sends only product ids, quantities and an address. `normalizeItems` validates and merges lines; `priceItems` reads prices from `products` and works in integer paise; delivery is a fixed ₹249. The browser's `amount` is used only to detect a stale price (mismatch → 400 "The order total has changed…"). Addresses are sanitised by `sanitizeAddress`: known fields only, trimmed, India only, valid pincode and phone.

### 7.4 Cash on delivery (`POST /api/order/place`)
Validate → price → save an order (`paymentMethod: "COD"`, `payment: false`, each line stores product, quantity, name and unit price) → clear the cart → create the Shiprocket order → respond. Shiprocket problems never fail the order response.

### 7.5 Razorpay
```
 browser                      backend                              Razorpay
   │ POST /order/razorpay ─────► validate, price, orders.create ───────►│
   │                             save paymentIntent (server amount)     │
   │◄──────── Razorpay order ────┘                                      │
   │ Razorpay Checkout ─────────────────────────────────────────────────►│
   │ POST /order/verifyRazorpay ─► check signature, find intent         │
   │                             payments.fetch (up to 4 tries, 1.5 s) ─►│
   │◄── order / 202 / error ─────  create order once, clear cart, ship   │
   │                       ◄── POST /order/razorpay-webhook (signed) ────┘
```
- The order is created **only** by `settleRazorpayPayment`, shared by the browser confirmation and the webhook. It first looks for an existing order with the same `razorpayOrderId`; the unique indexes make concurrent calls safe (the loser reads the winner's order). Only the call that created the order clears the cart and creates the shipment.
- Acceptance rules (`evaluatePayment`): payment belongs to the intent's Razorpay order; currency `INR`; amount a positive integer **not above** the intent amount (a lower captured amount, for example from a merchant-funded No Cost EMI offer, is accepted and the difference is stored as `discountPaise`); status `captured`. `authorized` answers `202 "still being confirmed"`.
- The webhook verifies HMAC-SHA256 over the raw bytes with `RAZORPAY_WEBHOOK_SECRET`. It handles `payment.captured` and `order.paid`, treats the payload only as a pointer, and asks Razorpay for the payment itself. Answers: 200 done or nothing to do, 400 bad signature or body, 503 to make Razorpay retry (lookup failure or still authorised, or secret missing).

### 7.6 Shiprocket and invoice
`createShiprocketOrder(orderId)`:
1. Reads the order and a cached token (`shiprockettokens`; logs in and caches one if none).
2. Derives amounts from the stored total: `sub_total = amount − 249`, per-unit price = `sub_total / total units`.
3. Posts `/orders/create/adhoc`. `payment_method` is `COD` for COD orders and `Prepaid` for paid Razorpay orders. Package height and weight are the per-unit values multiplied by the first line's quantity.
4. On success stores a `shiprocketorders` record, then calls this backend's own `/api/shiprocket/generate-invoice` with a 2-minute admin token. That route asks Shiprocket for the invoice URL and emails it to the address on the order.
5. A global axios response interceptor (`utils/shiprocketAuth.js`) handles Shiprocket 401s: log in again once, store the new token, repeat the call once.
6. Failures are caught and recorded on the order as `shipmentIssue` (`The Shiprocket order was not created` or `The invoice email was not sent`); the admin panel shows it.

The item name sent to Shiprocket is the fixed placeholder `IMPACTPURE Portable Water Purifier` with SKU `SKU-001`. `checkServiceability` still exists in the controller but has no route.

### 7.7 Newsletter
Validates the email, inserts it if new, and sends the confirmation email only for a new subscriber. The response is identical for new and existing addresses (no subscriber enumeration, no inbox flooding). A duplicate-key race is treated as "already subscribed".

### 7.8 Admin product management
`POST /api/product/add` accepts up to four images (`image1`–`image4`): JPG, PNG, WEBP or GIF, at most 5 MB each, random server-side file names. Files are uploaded to Cloudinary and the temporary files are always deleted. Name (up to 200 characters), description (up to 5000 characters), a positive price and at least one image are required.

## 8. Error and logging policy

- Handlers answer with generic messages (`Something went wrong, please try again.`); raw error text is not returned.
- Logs go to the Vercel runtime log only. Customer orders, phone numbers and OTPs are not logged; Twilio failures log code and status only.
- Email helpers (`utils/emailService.js`) catch and log their own errors, so mail failures never break a request. Customer-supplied text in emails is HTML-escaped.

## 9. Invariants worth preserving

1. Prices and totals are computed from the database; client amounts are never trusted.
2. An order exists for a Razorpay payment only after Razorpay confirms a captured payment for the server-created intent.
3. Replays and concurrent confirmations never create a second order, cart clear or shipment.
4. SMS can only be sent through `send-otp`, behind per-IP, per-phone and site-wide limits that fail closed.
5. Raw identifiers (IP, phone, email) are not stored in the rate-limit collection.
6. Admin-only routes (including invoice generation) always sit behind `adminAuth`.

## 10. Runtime notes

- Vercel serverless: cold starts reconnect to MongoDB; no in-memory state is relied on for correctness.
- `vercel.json` routes every path to `server.js`.
- Upload temp files use the platform temp directory.
- External calls (Razorpay, Shiprocket, Twilio, SMTP) have no application-level timeouts beyond the libraries' defaults.

## 11. Planned work and known gaps

- Paging for the admin order list.
- Single-use phone verification tokens.
- Cookie-based sessions instead of header tokens.
- Automated tests inside this repository and DPDP-related data handling.
