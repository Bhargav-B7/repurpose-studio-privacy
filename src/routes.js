const express = require("express");
const Article = require("./models/Article");
const Post = require("./models/Post");
const LinkedInConnection = require("./models/LinkedInConnection");
const { isDbConnected } = require("./db");

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

// Passes async errors to the Express error handler; bad input becomes HTTP 400.
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    if (err.name === "CastError" || err.name === "ValidationError") err.status = 400;
    next(err);
  });

const bad = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

// All routes below need MongoDB.
router.use((req, res, next) => {
  if (!isDbConnected()) {
    return res.status(503).json({
      error: "Database not connected. Check MONGODB_URI in .env and restart the server.",
    });
  }
  next();
});

// ---------- LinkedIn connection status (never returns the token) ----------
router.get("/linkedin/status", wrap(async (req, res) => {
  const c = await LinkedInConnection.findOne({ singleton: "default" }).lean();
  const connected = !!(c && c.accessToken);
  const expired = connected && !!c.expiresAt && new Date(c.expiresAt) < new Date();
  res.json({ connected, expired, name: (c && c.profileName) || "", expiresAt: (c && c.expiresAt) || null });
}));

// ---------- Articles ----------
router.get("/articles", wrap(async (req, res) => {
  res.json(await Article.find().sort({ createdAt: -1 }).lean());
}));

// Saves one article together with its generated posts.
router.post("/articles", wrap(async (req, res) => {
  const { title, text, posts } = req.body || {};
  if (!title || !String(title).trim()) throw bad("Title is required");
  if (!text || !String(text).trim()) throw bad("Article text is required");
  if (!Array.isArray(posts) || posts.length < 1 || posts.length > 20) {
    throw bad("Send between 1 and 20 posts");
  }
  for (const p of posts) {
    if (!Post.POST_TYPES.includes(p.type)) throw bad("Invalid post type: " + p.type);
    if (!p.text || !String(p.text).trim()) throw bad("Post text is required");
    if (!DATE_RE.test(p.date || "")) throw bad("Post date must be YYYY-MM-DD");
    if (!TIME_RE.test(p.time || "")) throw bad("Post time must be HH:MM");
  }

  const article = await Article.create({ title, text });
  try {
    const saved = await Post.insertMany(
      posts.map((p) => ({
        articleId: article._id,
        type: p.type,
        text: p.text,
        date: p.date,
        time: p.time,
      }))
    );
    res.status(201).json({ article: article.toObject(), posts: saved.map((d) => d.toObject()) });
  } catch (err) {
    await Article.findByIdAndDelete(article._id); // do not leave an article without posts
    throw err;
  }
}));

router.delete("/articles/:id", wrap(async (req, res) => {
  const article = await Article.findById(req.params.id);
  if (!article) throw bad("Article not found", 404);
  await Post.deleteMany({ articleId: article._id });
  await article.deleteOne();
  res.json({ ok: true });
}));

// ---------- Posts ----------
router.get("/posts", wrap(async (req, res) => {
  res.json(await Post.find().sort({ _id: 1 }).lean());
}));

router.patch("/posts/:id", wrap(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw bad("Post not found", 404);
  if (post.status === "published" || post.status === "publishing") {
    throw bad("This post is already " + post.status + " and cannot be edited", 409);
  }
  const { text, date, time } = req.body || {};
  const moved = (date !== undefined && date !== post.date) || (time !== undefined && time !== post.time);
  if (text !== undefined) {
    if (!String(text).trim()) throw bad("Post text cannot be empty");
    post.text = text;
  }
  if (date !== undefined) {
    if (!DATE_RE.test(date)) throw bad("Post date must be YYYY-MM-DD");
    post.date = date;
  }
  if (time !== undefined) {
    if (!TIME_RE.test(time)) throw bad("Post time must be HH:MM");
    post.time = time;
  }
  // Moving a failed post to a new date/time puts it back in the queue.
  if (moved && post.status === "failed") {
    post.status = "scheduled";
    post.error = "";
  }
  await post.save();
  res.json(post.toObject());
}));

router.post("/posts/:id/retry", wrap(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) throw bad("Post not found", 404);
  if (post.status !== "failed") throw bad("Only failed posts can be retried", 409);
  post.status = "scheduled";
  post.error = "";
  await post.save();
  res.json(post.toObject());
}));

router.delete("/posts/:id", wrap(async (req, res) => {
  const post = await Post.findByIdAndDelete(req.params.id);
  if (!post) throw bad("Post not found", 404);
  res.json({ ok: true });
}));

module.exports = router;