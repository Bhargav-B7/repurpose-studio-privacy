# Repurpose Studio — Implementation Plan (College Project)

**Status:** plan only. Do not write application code until this plan is approved.  
**Keep unchanged:** `repurpose-studio.html` (UI, generator, calendar, library). We will **copy** it into `public/` and wire it to the API; the original file stays in the repo.

## Goal

A small, real app you can demo in a viva:

1. Paste a blog in the existing UI  
2. Generate Thread / LinkedIn / Newsletter **drafts** (same logic as today)  
3. Save them on **MongoDB Atlas** and show them on the calendar  
4. At the scheduled date/time, a **Node timer on the server** publishes **LinkedIn** posts to **your** LinkedIn account  
5. The UI shows `scheduled` / `publishing` / `published` / `failed`, the error text if it failed, and the LinkedIn post URL when LinkedIn returns one  

**Out of scope (do not build):** Redis, BullMQ, JWT login, user roles, analytics, AI APIs, React, X, Threads, email/newsletter sending. Thread and Newsletter content is still **generated and scheduled in the UI**, but only **LinkedIn** posts are sent to a live network.

**Honesty rule:** never mark a post `published` unless LinkedIn actually accepted it. If OAuth or the Posts API is missing/denied, show a clear error and leave the post `failed` or `scheduled`. The rest of the app (generate, calendar, library) must still work.

---

## What you already have

`repurpose-studio.html` is a complete **offline** tool:

- Studio: article → rule-based Thread, LinkedIn, Newsletter drafts  
- Calendar: month grid, drag to reschedule, edit modal  
- Library: articles + delete  
- Stats, CSV export, copy, `localStorage` (`rs_state`)

The upgrade is: **same screens**, data on **MongoDB**, LinkedIn posts go out from the **server** even if the browser is closed.

---

## Simple architecture

```text
Browser  →  public/repurpose-studio.html  (existing UI + fetch)
                ↓
         Express (Node.js)
                ↓
         MongoDB Atlas (articles, posts, linkedinConnection)
                ↓
         Every minute: find due LinkedIn posts → LinkedIn API
```

One Node process does HTTP **and** the scheduler. No extra worker, no Redis. Easy to explain: “the server checks the clock every minute.”

Single-user project: no signup. LinkedIn OAuth is only for **permission to post**, not a full login system.

---

## Files we will create (only these)

```text
package.json
.gitignore
.env.example
README.md                          # Windows setup + how to run
public/repurpose-studio.html       # copy of the UI, then connect to API
src/server.js                      # Express + static files + start scheduler
src/db.js                          # MongoDB connection
src/models/Article.js
src/models/Post.js
src/models/LinkedInConnection.js   # one document: tokens + person URN
src/routes/articles.js
src/routes/posts.js
src/routes/linkedin.js             # OAuth start/callback, status, disconnect
src/contentEngine.js               # move existing generate functions here
src/scheduler.js                   # setInterval / node-cron every minute
src/linkedin.js                    # OAuth token exchange + create text post
```

**Do not delete** the original `repurpose-studio.html` at the repo root.

---

## Data (MongoDB)

**articles:** `title`, `text`, `createdAt`  
**posts:** `articleId`, `type` (`Thread` | `LinkedIn` | `Newsletter`), `text`, `date`, `time`, `status`, `error`, `publishedUrl`, `publishedAt`  

`status`: `scheduled` → `publishing` → `published` or `failed`

**linkedinConnection:** at most one row: `accessToken`, `refreshToken`, `expiresAt`, `personUrn`, `connectedAt`

---

## API (small)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/articles` | list |
| POST | `/api/articles` | create + generate posts (same rules as HTML) |
| DELETE | `/api/articles/:id` | article + its posts |
| GET | `/api/posts` | calendar / studio list |
| PATCH | `/api/posts/:id` | edit text, date, time |
| DELETE | `/api/posts/:id` | delete one post |
| GET | `/api/stats` | same four numbers as the UI |
| GET | `/api/linkedin/status` | connected or not (never pretend) |
| GET | `/api/linkedin/connect` | redirect to LinkedIn OAuth |
| GET | `/api/linkedin/callback` | save tokens |
| POST | `/api/linkedin/disconnect` | forget tokens |

CSV export can stay in the browser from loaded posts (no extra endpoint required).

---

## Steps (in order)

### 1. Node + Express
Init npm, Express, `dotenv`, `mongoose`, `cors`. Serve `public/`. `GET /api/health`. Run on Windows: `npm start`.

### 2. MongoDB Atlas
Free cluster, connection string in `.env`. Models above. Confirm inserts in Atlas.

### 3. Connect the existing frontend
Copy HTML into `public/`. Replace `localStorage` save/load with `fetch` to the APIs. Keep generate UI the same; generation can run on the **server** (`contentEngine.js` ported from the current script) so dates/channels match today’s behavior. If the API is down, show a toast — do not silently fall back to fake publish.

Show `status` on chips/cards. If `publishedUrl` exists, show **View on LinkedIn**. If `failed`, show `error`.

### 4. Background scheduler
In `scheduler.js`, every 60 seconds:

1. Find posts with `type: "LinkedIn"`, `status: "scheduled"`, and `date+time <= now`  
2. Set `publishing`  
3. Call LinkedIn  
4. On success: `published` + `publishedUrl`  
5. On failure: `failed` + readable `error` (including “LinkedIn is not connected”)  

Thread and Newsletter due posts are **not** sent anywhere; they stay `scheduled` (drafts on the calendar). Optional later.

The Node window must stay open (or the app must be deployed) for auto-publish. Closing the **browser** is fine; closing the **server** stops the clock. README will say this clearly.

### 5. Official LinkedIn OAuth + text posts
[LinkedIn Developer](https://www.linkedin.com/developers/) app. OAuth 2.0 authorization code flow. Create a member text post with the official API (current “Posts” / UGC docs at implementation time).

Store tokens only in MongoDB, not in the HTML file.

If LinkedIn app products are not approved or tokens are missing: `/api/linkedin/status` returns `connected: false` and a short reason. Scheduler **does not** invent success.

### 6. Statuses and errors
UI + API share the same statuses. Log LinkedIn HTTP errors into `post.error`. Never set `published` without a successful API response.

### 7. Windows setup and deploy notes
README: Node LTS, Atlas IP allowlist (`0.0.0.0/0` for a demo or your home IP), `.env`, `npm install`, `npm start`, open `http://localhost:3000`. LinkedIn redirect URL must be exactly `http://localhost:3000/api/linkedin/callback`.

Short deploy section: same Node app on Render/Railway (always-on, not a sleeping free function), Atlas URI, production redirect URL added in the LinkedIn app.

---

## Accounts and `.env`

| Need | What for |
|------|----------|
| MongoDB Atlas | articles + posts |
| LinkedIn Developer app | real posting |
| (later) a host that stays awake | auto-publish 24/7 |

```text
PORT=3000
MONGODB_URI=mongodb+srv://...
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback
TZ=Asia/Kolkata
```

LinkedIn: create the app, add the redirect URL, add yourself as a **test user** while the app is in Development mode. Production posting to any account may need LinkedIn product review — if that is blocked, the app must **say so**, not fake publish.

---

## Checklist

**Already in the HTML**

- [x] Studio, calendar, library, generator, CSV, local save  

**To build**

- [ ] Express server + `public/` copy of the UI  
- [ ] Atlas models and article/post/stats APIs  
- [ ] Frontend uses APIs instead of `localStorage`  
- [ ] LinkedIn connect / callback / status (real OAuth)  
- [ ] Scheduler publishes due LinkedIn posts only  
- [ ] Statuses, errors, published URL in the UI  
- [ ] README for Windows + short deploy notes  

**Must not happen**

- [ ] Posts marked `published` without LinkedIn success  
- [ ] JWT, Redis, extra social networks, newsletter sending  

---

## Approval gate

Wait for your OK before creating any of the files above or changing the UI copy. After approval, implement in the same order as the steps (1 → 7).
