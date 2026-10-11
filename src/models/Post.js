const mongoose = require("mongoose");

const POST_TYPES = ["Thread", "LinkedIn", "Newsletter"];
const POST_STATUSES = ["scheduled", "publishing", "published", "failed"];

const postSchema = new mongoose.Schema({
  articleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Article",
    required: true,
  },
  type: { type: String, enum: POST_TYPES, required: true },
  text: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  status: { type: String, enum: POST_STATUSES, default: "scheduled" },
  error: { type: String, default: "" },
  publishedUrl: { type: String, default: "" },
  publishedAt: { type: Date, default: null },
});

const Post = mongoose.model("Post", postSchema);
Post.POST_TYPES = POST_TYPES;
Post.POST_STATUSES = POST_STATUSES;
module.exports = Post;
