const express = require("express");
const LinkedInConnection = require("./models/LinkedInConnection");
const { isDbConnected } = require("./db");

const LINKEDIN_VERSION = process.env.LINKEDIN_VERSION || "202603"; // YYYYMM, see LinkedIn docs
const SCOPES = "openid profile w_member_social";
const authRouter = express.Router();

// One pending login at a time (single-user app): protects against forged callbacks.
let pendingState = null;
let pendingAt = 0;

function credentials() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("LinkedIn app credentials are missing in .env (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI).");
  }
  return { clientId, clientSecret, redirectUri };
}

// ---------- OAuth: Connect LinkedIn ----------
authRouter.get("/linkedin", (req, res) => {
  try {
    const { clientId, redirectUri } = credentials();
    pendingState = require("crypto").randomBytes(16).toString("hex");
    pendingAt = Date.now();
    const url = new URL("https://www.linkedin.com/oauth/v2/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", pendingState);
    url.searchParams.set("scope", SCOPES);
    res.redirect(url.toString());
  } catch (err) {
    res.redirect("/?linkedin=error&msg=" + encodeURIComponent(err.message));
  }
});

authRouter.get("/linkedin/callback", async (req, res) => {
  const back = (ok, msg) =>
    res.redirect("/?linkedin=" + (ok ? "connected" : "error") + (msg ? "&msg=" + encodeURIComponent(msg) : ""));
  try {
    if (req.query.error) return back(false, req.query.error_description || req.query.error);
    if (!pendingState || req.query.state !== pendingState || Date.now() - pendingAt > 10 * 60 * 1000) {
      return back(false, "Invalid or expired login attempt. Click Connect LinkedIn again.");
    }
    pendingState = null;
    if (!req.query.code) return back(false, "LinkedIn did not return a login code.");
    if (!isDbConnected()) return back(false, "Database not connected.");

    const { clientId, clientSecret, redirectUri } = credentials();

    // 1. Exchange the code for an access token
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: req.query.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(20000),
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tok.access_token) {
      return back(false, "LinkedIn login failed: " + (tok.error_description || tok.error || tokenRes.status));
    }

    // 2. Find out who just logged in (needed for the post author)
    const infoRes = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: "Bearer " + tok.access_token },
      signal: AbortSignal.timeout(20000),
    });
    const info = await infoRes.json().catch(() => ({}));
    if (!infoRes.ok || !info.sub) {
      return back(false, "Could not read your LinkedIn profile. Check that 'Sign In with LinkedIn using OpenID Connect' is added to the app.");
    }

    // 3. Save the connection (one document)
    await LinkedInConnection.findOneAndUpdate(
      { singleton: "default" },
      {
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token || "",
        expiresAt: new Date(Date.now() + (Number(tok.expires_in) || 5184000) * 1000),
        personUrn: "urn:li:person:" + info.sub,
        profileName: info.name || "",
        connectedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    back(true);
  } catch (err) {
    console.error("[linkedin] OAuth error:", err.message);
    back(false, "Connection failed: " + err.message);
  }
});

// ---------- Publishing ----------
// LinkedIn treats ( ) [ ] { } @ # * _ ~ < > | \ as formatting characters; escape them.
const escapeText = (text) => text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => "\\" + c);

/**
 * Publishes one post. Returns { url } ONLY when LinkedIn confirms (HTTP 201).
 * Throws an Error with a readable message on any problem, so the scheduler
 * marks the post "failed" instead of "published".
 */
async function publishPost(post) {
  if (post.type !== "LinkedIn") {
    throw new Error(`${post.type} publishing is not supported yet. Only LinkedIn posts are published.`);
  }

  const conn = await LinkedInConnection.findOne({ singleton: "default" });
  if (!conn || !conn.accessToken || !conn.personUrn) {
    throw new Error("LinkedIn not connected. Connect your LinkedIn account first.");
  }
  if (conn.expiresAt && conn.expiresAt < new Date()) {
    throw new Error("LinkedIn token expired. Reconnect your LinkedIn account.");
  }
  if (post.text.length > 3000) {
    throw new Error(`Post is ${post.text.length} characters. LinkedIn allows at most 3000.`);
  }

  let res;
  try {
    res = await fetch("https://api.linkedin.com/rest/posts", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + conn.accessToken,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
        "Linkedin-Version": LINKEDIN_VERSION,
      },
      body: JSON.stringify({
        author: conn.personUrn,
        commentary: escapeText(post.text),
        visibility: "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
        isReshareDisabledByAuthor: false,
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (err) {
    throw new Error("Could not reach LinkedIn: " + err.message);
  }

  if (res.status !== 201) {
    const raw = await res.text().catch(() => "");
    let msg = raw;
    try { msg = JSON.parse(raw).message || raw; } catch (e) { /* keep raw text */ }
    if (res.status === 401) throw new Error("LinkedIn rejected the token (401). Reconnect your LinkedIn account.");
    throw new Error(`LinkedIn error ${res.status}: ${String(msg).slice(0, 300)}`);
  }

  const id = res.headers.get("x-restli-id") || "";
  return { url: id ? `https://www.linkedin.com/feed/update/${id}/` : "" };
}

module.exports = { authRouter, publishPost, escapeText };