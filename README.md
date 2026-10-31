# IMPACTPURE Backend (`impactpure-backend`)

REST API for the IMPACTPURE store: customer accounts with phone OTP, products, carts, COD and Razorpay orders, Shiprocket shipments and invoices, newsletter, and the admin endpoints used by the admin panel.

- **Stack:** Node.js 22 (ESM), Express 4, Mongoose 8 on MongoDB Atlas, Cloudinary, Razorpay, Twilio, Gmail SMTP (Nodemailer), Shiprocket.
- **Runs as:** a single Vercel serverless function (`server.js`) behind `vercel.json`.
- **Clients:** storefront (`impactpure-frontend`) and admin panel (`impactpure-admin`). Design details are in [ARCHITECTURE.md](./ARCHITECTURE.md).

## Quick start

```powershell
npm install
Copy-Item .env.example .env    # then fill in the values
npm run server                 # nodemon, restarts on change
# or: npm start                # plain node
```

Health check: `GET /` returns `API Working`. Default port is `4000` (`PORT` overrides).

**Local safety:** the database name is fixed to `e-commerce`. `MONGODB_URI` must be the cluster address **without** a path or query string (the code appends `/e-commerce`). Do not run a local server against the production database; use a separate cluster or a database you can lose.

## Scripts

| Script | Command | Use |
|---|---|---|
| `npm start` | `node server.js` | Production style start |
| `npm run server` | `nodemon server.js` | Local development |

There is no build step, no lint script and no test suite in this repository.

## Environment variables

Values are secrets and live only in the Vercel project settings and the team password manager. `*` = read by the code but **not yet listed in `.env.example`**.

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Atlas cluster address, no path (database `e-commerce` is appended) |
| `JWT_SECRET` | yes | Signs customer, admin, phone-verification and internal tokens; also keys the HMAC that hashes rate-limit identities |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | yes | The single admin account (compared in constant time) |
| `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_SECRET_KEY` | yes | Product image storage |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | yes | Razorpay orders and payment signature check |
| `RAZORPAY_WEBHOOK_SECRET` * | yes for webhooks | Verifies Razorpay webhook signatures. If unset the webhook answers 503 (fails closed) |
| `TWILIO_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE` | yes | OTP SMS (sender number is used as given; recipients are sent as E.164 `+91…`) |
| `EMAIL_USER`, `EMAIL_PASS` | yes | Gmail SMTP sender (app password) |
| `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`, `SHIPROCKET_BASE_URL` | yes | Shiprocket API login and base URL |
| `SHIPROCKET_PICKUP_LOCATION` | yes | Pickup location name sent with each shipment |
| `SHIPROCKET_ORDER_LENGTH`, `_BREADTH`, `_HEIGHT`, `_WEIGHT` | yes | Package size and weight for **one** unit (height and weight are multiplied by quantity) |
| `SHIPROCKET_ORIGIN_PINCODE` | no | Read only by an unrouted serviceability helper |
| `BACKEND_API_BASE_URL` * | yes | This backend's own public URL; used when the backend calls its own invoice route |
| `CORS_ORIGINS` * | recommended | Comma-separated browser origins allowed to call the API. If unset or empty, every origin is allowed |
| `PORT` * | no | Local port (default 4000) |

Current production `CORS_ORIGINS`: `https://impactpure.com`, `https://www.impactpure.com`, `https://impactpure.vercel.app`, `https://impactpure-admin.vercel.app`, `http://localhost:3000`, `http://localhost:5174`.

## API summary

"Admin" = header `token` holding an admin JWT. "User" = header `token` (or `Authorization: Bearer`) holding a customer JWT.

| Method and path | Auth | Notes |
|---|---|---|
| `GET /` | none | Health check |
| `POST /api/user/send-otp` | none | Rate limited; 60 s resend cooldown; daily SMS cap |
| `POST /api/user/verify-otp` | none | Returns a 15-minute `verificationToken` |
| `POST /api/user/register` | verification token | Password rules apply |
| `POST /api/user/login` | none | `identifier` is email or Indian mobile |
| `POST /api/user/reset-password` | verification token | Ends all earlier sessions |
| `GET /api/user/profile` | user | name, email, phone |
| `POST /api/user/admin` | none | Admin login, 8-hour token |
| `GET /api/product/list`, `POST /api/product/single` | none | Public catalogue |
| `POST /api/product/add` | admin | Multipart, fields `image1`–`image4` |
| `POST /api/product/remove` | admin | |
| `POST /api/cart/get`, `/add`, `/update`, `/remove` | user | |
| `POST /api/order/place` | user | Cash on delivery; limited to 10 starts/hour/user |
| `POST /api/order/razorpay` | user | Starts a Razorpay payment; same limit |
| `POST /api/order/verifyRazorpay` | user | Browser confirmation; `202` means still being confirmed |
| `POST /api/order/razorpay-webhook` | signature | Razorpay server-to-server |
| `POST /api/order/userorders` | user | The caller's orders |
| `POST /api/order/list`, `/status` | admin | All orders; change status |
| `POST /api/newsletter/subscribe` | none | Rate limited |
| `POST /api/shiprocket/generate-invoice` | admin | Also called by the backend itself with a 2-minute admin token |

Conventions: auth, account and admin failures return HTTP 200 with `success: false`; validation failures return 400; rate limits return 429 with `Retry-After`; an unavailable limiter on OTP routes returns 503. Details per flow are in the architecture document.

## Dependencies

| Package | Range (installed) | Role |
|---|---|---|
| express | ^4.21.2 (4.22.3) | HTTP server |
| mongoose | ^8.9.5 (8.24.7) | MongoDB models |
| jsonwebtoken | ^9.0.2 | Tokens (HS256 only) |
| bcrypt | ^6.0.0 | Password and OTP hashing |
| validator | ^13.12.0 (13.15.35) | Email checks |
| multer | ^2.5.0 | Image upload parsing |
| cloudinary | ^2.4.0 (2.11.0) | Image hosting |
| razorpay | ^2.9.4 (2.9.5) | Payments |
| twilio | ^5.4.0 | OTP SMS |
| nodemailer | ^10.2.1 | Email (Gmail SMTP) |
| axios | ^1.7.9 (1.20.0) | Shiprocket calls |
| cors, dotenv | ^2.8.5, ^16.4.7 | Middleware, local env loading |
| nodemon (dev) | ^3.1.4 | Local reload |

`npm audit` reports 0 vulnerabilities at the time of writing.

## Deployment

- One production environment: Vercel project `impactpure-backend`, branch `main`, Node 22.x. Public host `https://impactpure-backend.vercel.app` (clients hard-code it through their own env vars; keep it stable).
- Every push to `main` deploys to production. There is no staging environment.
- `vercel.json` uses the legacy `builds` configuration (`@vercel/node`, all routes to `server.js`). Leave it as is.
- Roll back from the Vercel Deployments page by promoting the previous deployment.

## Operations cheat sheet

| Situation | What to do |
|---|---|
| Admin or customer locked out by rate limits | Wait for the window (15 minutes to 1 hour) or delete the documents in the `ratelimits` collection |
| OTP not arriving | Check the Vercel log line `Twilio send failed. code: … status: …` (no phone number is logged) and the Twilio account balance |
| Order paid but not in "My Orders" | Check the payment in the Razorpay dashboard and its webhook delivery log. The webhook (`payment.captured` / `order.paid`) is what completes an order when the browser did not return |
| Order has a red "Shipment issue" in admin | The Shiprocket order or the invoice email failed; create the shipment manually in Shiprocket, then correct the order |
| Shiprocket login problems | The token cache is the `shiprockettokens` collection; a 401 triggers one automatic re-login |

## Known limitations and planned work

- The admin order list returns all orders in one response (no paging).
- Tokens are sent in a header and stored in browser local storage by the clients (no httpOnly cookies).
- A phone verification token can be reused until it expires (15 minutes).
- `.env.example` does not yet list the variables marked `*`.
- Data-protection (DPDP) work and an automated test suite are not part of this repository yet.
