// Server-side order pricing and input validation.
// The browser never decides prices or totals: it only says which products and how many.
import validator from "validator";

export const DELIVERY_CHARGE_RUPEES = 249;
export const MAX_QTY_PER_ITEM = 10;
export const MAX_DISTINCT_ITEMS = 20;

const OBJECT_ID = /^[a-fA-F0-9]{24}$/;

// Validates and merges the cart lines sent by the browser.
// Only product ids and whole-number quantities are accepted.
export const normalizeItems = (rawItems) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, message: "Cannot place order with an empty cart." };
  }
  if (rawItems.length > MAX_DISTINCT_ITEMS) {
    return { ok: false, message: "Too many items in the cart." };
  }
  const merged = new Map();
  for (const line of rawItems) {
    const id = line && typeof line._id === "string" ? line._id.trim() : "";
    const qty = line ? line.quantity : undefined;
    if (!OBJECT_ID.test(id)) {
      return { ok: false, message: "Invalid product in cart." };
    }
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ITEM) {
      return { ok: false, message: "Invalid quantity in cart." };
    }
    const key = id.toLowerCase();
    merged.set(key, (merged.get(key) || 0) + qty);
  }
  const items = [];
  for (const [_id, quantity] of merged) {
    if (quantity > MAX_QTY_PER_ITEM) {
      return { ok: false, message: "Invalid quantity in cart." };
    }
    items.push({ _id, quantity });
  }
  return { ok: true, items };
};

// items: output of normalizeItems. products: product documents with _id, name and price (rupees).
export const priceItems = (items, products) => {
  const byId = new Map(products.map((p) => [String(p._id).toLowerCase(), p]));
  let subtotalPaise = 0;
  const lines = [];
  for (const { _id, quantity } of items) {
    const product = byId.get(_id);
    if (!product) {
      return { ok: false, message: "A product in your cart is no longer available." };
    }
    const price = product.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
      return { ok: false, message: "A product in your cart cannot be ordered right now." };
    }
    const unitPricePaise = Math.round(price * 100);
    subtotalPaise += unitPricePaise * quantity;
    lines.push({ product: _id, name: product.name, unitPricePaise, quantity });
  }
  const deliveryPaise = DELIVERY_CHARGE_RUPEES * 100;
  const totalPaise = subtotalPaise + deliveryPaise;
  return {
    ok: true,
    lines,
    subtotalPaise,
    deliveryPaise,
    totalPaise,
    totalRupees: totalPaise / 100,
  };
};

const ADDRESS_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "address_line1",
  "address_line2",
  "city",
  "state",
  "pincode",
  "country",
  "phone",
  "alt_phone",
];
const REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "address_line1",
  "city",
  "state",
  "pincode",
  "country",
  "phone",
];

// Returns the 10 digit Indian mobile number, or null if the value is not one.
const normalizePhone = (value) => {
  const digits = value.replace(/[\s-]/g, "");
  const match = digits.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  return match ? match[1] : null;
};

// Keeps only the known address fields, trimmed, and checks the important ones.
export const sanitizeAddress = (raw) => {
  const invalid = { ok: false, message: "Invalid address." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return invalid;
  }
  const out = {};
  for (const field of ADDRESS_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null || value === "") {
      out[field] = "";
      continue;
    }
    if (typeof value !== "string") {
      return invalid;
    }
    const trimmed = value.trim();
    if (trimmed.length > 200) {
      return invalid;
    }
    out[field] = trimmed;
  }
  for (const field of REQUIRED_FIELDS) {
    if (!out[field]) {
      return { ok: false, message: "Please fill in all required address fields." };
    }
  }
  if (!validator.isEmail(out.email)) {
    return { ok: false, message: "Invalid email address." };
  }
  if (!/^\d{6}$/.test(out.pincode)) {
    return { ok: false, message: "Invalid pincode." };
  }
  if (out.country.toLowerCase() !== "india") {
    return { ok: false, message: "We currently deliver within India only." };
  }
  out.country = "India";
  const phone = normalizePhone(out.phone);
  if (!phone) {
    return { ok: false, message: "Invalid phone number." };
  }
  out.phone = phone;
  if (out.alt_phone) {
    const alt = normalizePhone(out.alt_phone);
    if (!alt) {
      return { ok: false, message: "Invalid alternate phone number." };
    }
    out.alt_phone = alt;
  }
  return { ok: true, address: out };
};

// Splits a stored order total (rupees: goods + delivery) into the values Shiprocket needs.
export const deriveShiprocketAmounts = (orderAmountRupees, totalUnits) => {
  const shippingCharges = DELIVERY_CHARGE_RUPEES;
  const subTotal = orderAmountRupees - shippingCharges;
  if (
    !Number.isFinite(subTotal) ||
    subTotal <= 0 ||
    !Number.isInteger(totalUnits) ||
    totalUnits < 1
  ) {
    throw new Error("Cannot derive Shiprocket amounts from this order");
  }
  return { shippingCharges, subTotal, unitPrice: subTotal / totalUnits };
};
