# Impactpure API

Node.js (ESM) + Express + MongoDB (Mongoose) backend for the Impactpure store. Deployed on Vercel as a serverless function; vercel.json uses the legacy @vercel/node builds config (leave as is).

## Deployment
- Production: Vercel project "impactpure-backend", branch main, root ./, Node 22.x. Public host: https://impactpure-backend.vercel.app (keep it stable).
- Staging: Vercel project "impactpure-api-staging", branch staging, fake data only.
- Every push to main is a production deploy.

## Local development
The database name is hardcoded as "e-commerce"; MONGODB_URI is the cluster address WITHOUT a path or query string. Never run locally against the production database. Copy .env.example to .env.
    npm install
    npm run server

## Environment variables (names only; values live only in the team password manager)
App: backend. Environments: Production and Staging only; Preview and Development are intentionally empty.

| Variable | Visibility | Environments | Service |
|---|---|---|---|
| MONGODB_URI | server-only | Production, Staging | MongoDB Atlas |
| JWT_SECRET | server-only | Production, Staging | application auth |
| ADMIN_EMAIL | server-only | Production, Staging | application auth |
| ADMIN_PASSWORD | server-only | Production, Staging | application auth |
| CLOUDINARY_NAME | server-only | Production (Staging: placeholder) | Cloudinary |
| CLOUDINARY_API_KEY | server-only | Production (Staging: placeholder) | Cloudinary |
| CLOUDINARY_SECRET_KEY | server-only | Production (Staging: placeholder) | Cloudinary |
| RAZORPAY_KEY_ID | server-only | Production (live), Staging (test) | Razorpay |
| RAZORPAY_KEY_SECRET | server-only | Production (live), Staging (test) | Razorpay |
| TWILIO_SID | server-only | Production (live), Staging (test credentials) | Twilio |
| TWILIO_AUTH_TOKEN | server-only | Production (live), Staging (test credentials) | Twilio |
| TWILIO_PHONE | server-only | Production, Staging (magic number) | Twilio |
| EMAIL_USER | server-only | Production (Staging: placeholder) | Gmail SMTP |
| EMAIL_PASS | server-only | Production (Staging: placeholder) | Gmail SMTP |
| SHIPROCKET_EMAIL | server-only | Production (Staging: placeholder) | Shiprocket |
| SHIPROCKET_PASSWORD | server-only | Production (Staging: placeholder) | Shiprocket |
| SHIPROCKET_BASE_URL | server-only | Production (Staging: unreachable host) | Shiprocket |
| SHIPROCKET_PICKUP_LOCATION | server-only | Production, Staging | Shiprocket |
| SHIPROCKET_ORDER_LENGTH | server-only | Production, Staging | Shiprocket |
| SHIPROCKET_ORDER_BREADTH | server-only | Production, Staging | Shiprocket |
| SHIPROCKET_ORDER_HEIGHT | server-only | Production, Staging | Shiprocket |
| SHIPROCKET_ORDER_WEIGHT | server-only | Production, Staging | Shiprocket |
| SHIPROCKET_ORIGIN_PINCODE | server-only | Production, Staging | Shiprocket |
| BACKEND_API_BASE_URL | server-only | Production, Staging (each points at itself) | this backend |
| PORT | server-only | local runs only | Node |
