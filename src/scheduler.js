// const Post = require("./models/Post");
// const { isDbConnected } = require("./db");
// const { publishPost } = require("./linkedin");

// const INTERVAL_MS = 60 * 1000;
// let timezone = process.env.TIMEZONE || "Asia/Kolkata";
// let running = false;

// // Current date/time in the app timezone as "YYYY-MM-DD HH:MM".
// // Post date/time are stored as plain strings in this same timezone.
// function nowLocal() {
//   return new Date().toLocaleString("sv-SE", { timeZone: timezone }).slice(0, 16);
// }

// async function processDue() {
//   if (running || !isDbConnected()) return;
//   running = true;
//   try {
//     const [date, time] = nowLocal().split(" ");
//     const due = await Post.find({
//       status: "scheduled",
//       $or: [{ date: { $lt: date } }, { date, time: { $lte: time } }],
//     })
//       .sort({ date: 1, time: 1 })
//       .select("_id")
//       .lean();

//     for (const d of due) {
//       // Claim the post first so it can never be processed twice.
//       const post = await Post.findOneAndUpdate(
//         { _id: d._id, status: "scheduled" },
//         { status: "publishing", error: "" },
//         { new: true }
//       );
//       if (!post) continue;

//       try {
//         const result = await publishPost(post);
//         post.status = "published";
//         post.publishedAt = new Date();
//         post.publishedUrl = (result && result.url) || "";
//         post.error = "";
//       } catch (err) {
//         post.status = "failed";
//         post.error = err.message;
//       }
//       await post.save();
//       console.log(`[scheduler] ${post.type} post ${post._id} -> ${post.status}${post.error ? ": " + post.error : ""}`);
//     }
//   } catch (err) {
//     console.error("[scheduler] error:", err.message);
//   } finally {
//     running = false;
//   }
// }

// async function startScheduler() {
//   try {
//     nowLocal();
//   } catch (err) {
//     console.error(`[scheduler] Invalid TIMEZONE "${timezone}". Using UTC.`);
//     timezone = "UTC";
//   }

//   // A post left in "publishing" means the server stopped mid-publish.
//   // Do not retry automatically (it could double-post).
//   await Post.updateMany(
//     { status: "publishing" },
//     { status: "failed", error: "Interrupted while publishing. Check LinkedIn before retrying." }
//   );

//   console.log(`[scheduler] Started. Checking every minute (timezone: ${timezone}).`);
//   processDue();
//   setInterval(processDue, INTERVAL_MS);
// }

// module.exports = { startScheduler, processDue, nowLocal };

const Post = require("./models/Post");
const { isDbConnected } = require("./db");
const { publishPost } = require("./linkedin");
const { sendNewsletter } = require("./email");

// Thread posts are intentionally NOT automated (copy & post manually).
const PUBLISHERS = { LinkedIn: publishPost, Newsletter: sendNewsletter };

const INTERVAL_MS = 60 * 1000;
let timezone = process.env.TIMEZONE || "Asia/Kolkata";
let running = false;

// Current date/time in the app timezone as "YYYY-MM-DD HH:MM".
// Post date/time are stored as plain strings in this same timezone.
function nowLocal() {
  return new Date().toLocaleString("sv-SE", { timeZone: timezone }).slice(0, 16);
}

async function processDue() {
  if (running || !isDbConnected()) return;
  running = true;
  try {
    const [date, time] = nowLocal().split(" ");
    const due = await Post.find({
      status: "scheduled",
      type: { $in: Object.keys(PUBLISHERS) },
      $or: [{ date: { $lt: date } }, { date, time: { $lte: time } }],
    })
      .sort({ date: 1, time: 1 })
      .select("_id")
      .lean();

    for (const d of due) {
      // Claim the post first so it can never be processed twice.
      const post = await Post.findOneAndUpdate(
        { _id: d._id, status: "scheduled" },
        { status: "publishing", error: "" },
        { new: true }
      );
      if (!post) continue;

      try {
        const result = await PUBLISHERS[post.type](post);
        post.status = "published";
        post.publishedAt = new Date();
        post.publishedUrl = (result && result.url) || "";
        post.error = "";
      } catch (err) {
        post.status = "failed";
        post.error = err.message;
      }
      await post.save();
      console.log(`[scheduler] ${post.type} post ${post._id} -> ${post.status}${post.error ? ": " + post.error : ""}`);
    }
  } catch (err) {
    console.error("[scheduler] error:", err.message);
  } finally {
    running = false;
  }
}

async function startScheduler() {
  try {
    nowLocal();
  } catch (err) {
    console.error(`[scheduler] Invalid TIMEZONE "${timezone}". Using UTC.`);
    timezone = "UTC";
  }

  // A post left in "publishing" means the server stopped mid-publish.
  // Do not retry automatically (it could double-post).
  await Post.updateMany(
    { status: "publishing" },
    { status: "failed", error: "Interrupted while publishing. Check LinkedIn before retrying." }
  );

  console.log(`[scheduler] Started. Checking every minute (timezone: ${timezone}).`);
  processDue();
  setInterval(processDue, INTERVAL_MS);
}

module.exports = { startScheduler, processDue, nowLocal };