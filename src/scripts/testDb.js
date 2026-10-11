require("dotenv").config();

const mongoose = require("mongoose");
const { connectDb } = require("../db");
const Article = require("../models/Article");
const Post = require("../models/Post");

const TEST_TITLE = "Step 2 connection test";

async function main() {
  const ok = await connectDb();
  if (!ok) {
    console.error("No database connection. Add MONGODB_URI to your .env file and try again.");
    process.exit(1);
  }

  await Article.deleteMany({ title: TEST_TITLE });
  await Post.deleteMany({ text: "Step 2 test post — safe to delete." });

  const article = await Article.create({
    title: TEST_TITLE,
    text: "This row was created by npm run test:db to prove Atlas is working.",
  });

  const post = await Post.create({
    articleId: article._id,
    type: "LinkedIn",
    text: "Step 2 test post — safe to delete.",
    date: "2026-10-10",
    time: "09:00",
    status: "scheduled",
  });

  const articleCount = await Article.countDocuments();
  const postCount = await Post.countDocuments();

  console.log("Insert OK. Open Atlas → Browse Collections and look for:");
  console.log("  articles:", article._id.toString(), article.title);
  console.log("  posts:   ", post._id.toString(), post.type, post.status);
  console.log("Totals — articles:", articleCount, "posts:", postCount);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("Database test failed:", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
