# Repurpose Studio

College project: turn one article into social drafts, put them on a calendar, and later publish LinkedIn posts at the scheduled time.

The original `repurpose-studio.html` is unchanged. Step 1 is the Express health check. Step 2 adds MongoDB Atlas models.

## Windows setup

1. Install [Node.js LTS](https://nodejs.org/) (18 or newer). Confirm in **Command Prompt** or **PowerShell**:

```bat
node -v
npm -v
```

2. Open a terminal in the project folder:

```bat
cd D:\Bhargav-Projects\RepurposeStudio
```

3. Install packages:

```bat
npm install
```

4. Copy the example env file (optional for Step 1 — the server runs without MongoDB):

```bat
copy .env.example .env
```

5. Start the server:

```bat
npm start
```

6. In a **second** terminal, check that the API is up:

```bat
curl http://localhost:3000/api/health
```

PowerShell alternative:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
```

You should see JSON with `"status": "ok"`.

Stop the server with `Ctrl+C`.

## Step 2 — MongoDB Atlas (Windows)

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Database Access → add a user with a password.
3. Network Access → add your IP, or `0.0.0.0/0` for a college demo.
4. Database → Connect → Drivers → copy the `mongodb+srv://...` URI.
5. Put it in `.env` (replace `<password>` and add a database name):

```text
MONGODB_URI=mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/repurpose_studio
```

6. Prove inserts work (server does not need to be running):

```bat
cd D:\Bhargav-Projects\RepurposeStudio
npm run test:db
```

Then in Atlas: **Browse Collections** → `articles` and `posts`. You should see a document titled **Step 2 connection test**.

7. Restart `npm start`. Health should include `"mongodb": "connected"`:

```bat
curl http://localhost:3000/api/health
```

The server still starts if `MONGODB_URI` is missing; article APIs and LinkedIn publishing come in later steps.
