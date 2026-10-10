import nodemailer from "nodemailer";
import fs from "fs";

// Configure the transporter with your email service
const transporter = nodemailer.createTransport({
  service: "gmail", // Change to your email service provider if not using Gmail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendWelcomeEmail = async (email, name) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome to IMPACTPURE - Revolutionizing Water Purification!",
      html: `<h1>Hello ${name},</h1>
                   <p>Welcome to the IMPACTPURE family! We're thrilled to have you on board. By choosing IMPACTPURE, you're making a sustainable, health-conscious choice for yourself and the planet.</p>
                   <p>Our patented, eco-friendly water purifiers are designed to retain essential minerals, require no electricity, and ensure zero water wastage. We aim to provide you with pure, fresh water wherever you are.</p>
                   <br>
                   <p>Best Regards,<br>The IMPACTPURE Team</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to: ${email}`);
  } catch (error) {
    console.error("Error sending welcome email:", error);
  }
};

// Function to send thank-you email after newsletter subscription
export const sendSubscriptionEmail = async (email) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Thank You for Subscribing to IMPACTPURE!",
      html: `<h1>Hello,</h1>
                   <p>Thank you for subscribing to <strong>IMPACTPURE</strong>. You are now part of our journey towards providing sustainable and healthy hydration solutions!</p>
                   <p>As a subscriber, you will be the first to know about our latest updates, exclusive offers, and new products. Stay tuned for more exciting news!</p>
                   <br>
                   <p>Best Regards,<br>IMPACTPURE Team</p>`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Subscription confirmation email sent to: ${email}`);
  } catch (error) {
    console.error("Error sending subscription email:", error);
  }
};

export const sendInvoiceEmail = async (email, invoiceUrl) => {
  try {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your IMPACTPURE Order Invoice - [Order Confirmation]",
      html: `
            <h1>Hello,</h1>
            <p>Thank you for shopping with IMPACTPURE! We are delighted to provide you with the finest water purification solution.</p>
            <p>Here is the invoice for your recent purchase. Click the link below to download it:</p>
            <p><a href="${invoiceUrl}" target="_blank"><strong>Download Invoice</strong></a></p>
            <br>
            <p>Best Regards,<br>IMPACTPURE Team</p>
            `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Invoice email sent to: ${email}`);
  } catch (error) {
    console.error("🚨 Error sending invoice email:", error);
  }
};
