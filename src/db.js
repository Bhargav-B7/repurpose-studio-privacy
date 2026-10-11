const mongoose = require("mongoose");

/**
 * Connect to MongoDB Atlas when MONGODB_URI is set.
 * Step 1: missing or invalid URI must not stop the HTTP server.
 */
async function connectDb() {
  const uri = process.env.MONGODB_URI;

  if (!uri || !uri.trim()) {
    console.log("MONGODB_URI is not set. Skipping database connection.");
    return false;
  }

  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB.");
    return true;
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
    console.error("The API server will keep running without a database.");
    return false;
  }
}

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isDbConnected };
