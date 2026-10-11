const nodemailer = require("nodemailer");

const escapeHtml = (t) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Emails a newsletter snippet to the addresses in NEWSLETTER_TO.
 * Returns { url: "" } only when the mail server ACCEPTS the message.
 * Throws an Error with a readable message otherwise, so the scheduler
 * marks the post "failed" instead of "published".
 */
async function sendNewsletter(post) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_APP_PASSWORD;
  const to = (process.env.NEWSLETTER_TO || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (!user || !pass) {
    throw new Error("Email not configured. Set EMAIL_USER and EMAIL_APP_PASSWORD in .env.");
  }
  if (to.length === 0 || to.some((e) => !e.includes("@"))) {
    throw new Error("No valid recipients. Set NEWSLETTER_TO in .env (comma-separated emails).");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
    connectionTimeout: 15000,
    socketTimeout: 20000,
  });

  const subject = (post.text.split("\n").find((l) => l.trim()) || "Newsletter snippet").trim().slice(0, 120);

  let info;
  try {
    info = await transporter.sendMail({
      from: `"Repurpose Studio" <${user}>`,
      to,
      subject,
      text: post.text,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">${escapeHtml(post.text).replace(/\n/g, "<br>")}</div>`,
    });
  } catch (err) {
    if (err.code === "EAUTH") {
      throw new Error("Gmail rejected the login. Use a Google App Password (not your normal password).");
    }
    throw new Error("Email failed: " + err.message);
  }

  if (!info.accepted || info.accepted.length === 0) {
    throw new Error("The mail server did not accept the email for any recipient.");
  }
  return { url: "" };
}

module.exports = { sendNewsletter };