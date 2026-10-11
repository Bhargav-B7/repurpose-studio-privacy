const mongoose = require("mongoose");

const linkedInConnectionSchema = new mongoose.Schema({
  singleton: { type: String, default: "default", unique: true },
  accessToken: { type: String, default: "" },
  refreshToken: { type: String, default: "" },
  expiresAt: { type: Date, default: null },
  personUrn: { type: String, default: "" },
  profileName: { type: String, default: "" },
  connectedAt: { type: Date, default: null },
});

module.exports = mongoose.model("LinkedInConnection", linkedInConnectionSchema);