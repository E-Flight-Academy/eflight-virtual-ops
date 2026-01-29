# E-Flight Virtual Ops

AI-powered chat assistant for E-Flight Academy. Answers questions from students, instructors, and visitors about flight training operations using documents from a Google Drive knowledge base.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with E-Flight brand colors
- **AI**: Google Gemini 2.0 Flash Lite
- **Knowledge Base**: Google Drive + Gemini File API
- **Conversation Starters**: Notion database
- **Deployment**: Vercel

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── auth/route.ts              # Password authentication
│   │   ├── chat/route.ts              # Gemini chat endpoint
│   │   ├── knowledge-base/
│   │   │   ├── status/route.ts        # KB sync status (file count, last synced)
│   │   │   └── warm/route.ts          # Pre-warm KB cache
│   │   ├── starters/route.ts          # Serve conversation starters
│   │   └── sync-notion/route.ts       # Sync starters from Notion
│   ├── globals.css                    # Brand colors + Tailwind config
│   ├── layout.tsx                     # Root layout (Ruda font)
│   └── page.tsx                       # Home page
├── components/
│   └── Chat.tsx                       # Main chat interface
└── lib/
    ├── documents.ts                   # Document context orchestrator + cache
    ├── gemini-files.ts                # Gemini File API upload manager
    ├── google-drive.ts                # Google Drive API client
    └── starters.ts                    # Notion starters fetch + cache
```

### Key modules

- **`google-drive.ts`** — Authenticates with a service account, recursively lists files in the Drive folder, exports Google Workspace files (Docs, Sheets, Slides) to text, and downloads binary files (PDFs, images).
- **`gemini-files.ts`** — Uploads binary files to the Gemini File API via temp files, caches upload URIs for 47 hours (Gemini expires them after 48h), and builds `Part[]` arrays for chat requests.
- **`documents.ts`** — Orchestrates the above two modules. Fetches all Drive files, separates text from binary, builds a system instruction string and file parts array. Caches the result for 1 hour with concurrent-fetch locking.
- **`starters.ts`** — Fetches conversation starters from a Notion database, filtered by "Show as Starter" checkbox and sorted by "Order" property. In-memory cache with 1-hour TTL.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key ([get one](https://aistudio.google.com/apikey)) |
| `SITE_PASSWORD` | Yes | Password to access the chat interface |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Yes | Base64-encoded Google Service Account JSON key |
| `GOOGLE_DRIVE_FOLDER_ID` | Yes | Google Drive folder ID containing knowledge base documents |
| `NOTION_API_KEY` | Yes | Notion internal integration token |
| `NOTION_DATABASE_ID` | Yes | Notion database ID for conversation starters |
| `SYNC_SECRET` | Yes | Secret token to authorize `/api/sync-notion` calls |
| `CRON_SECRET` | No | Vercel auto-injects this for cron job authentication |
| `EDGE_CONFIG` | No | Vercel Edge Config connection string (reserved for future use) |

### Google Service Account setup

1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Base64-encode it: `base64 -i service-account.json`
4. Set the output as `GOOGLE_SERVICE_ACCOUNT_KEY`
5. Share the Google Drive folder (or Shared Drive) with the service account email as Viewer

### Notion setup

1. Create an internal integration at [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Copy the integration token as `NOTION_API_KEY`
3. Open your Notion database, click **...** > **Connections** > add your integration
4. The database needs a **title** property, a **"Show as Starter"** checkbox, and an **"Order"** number property

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth` | None | Validate site password |
| POST | `/api/chat` | None | Send message to Gemini with knowledge base context |
| GET | `/api/knowledge-base/status` | None | Get KB sync status (file count, names, last synced) |
| POST/GET | `/api/knowledge-base/warm` | None | Pre-warm the knowledge base cache |
| GET | `/api/starters` | None | Get conversation starter texts |
| POST/GET | `/api/sync-notion` | `SYNC_SECRET` or `CRON_SECRET` | Sync starters from Notion |

### Sync-notion authentication

The `/api/sync-notion` endpoint accepts the `SYNC_SECRET` token in two ways:

```bash
# Via Authorization header
curl -X POST https://your-domain.vercel.app/api/sync-notion \
  -H "Authorization: Bearer YOUR_SYNC_SECRET"

# Via query parameter
curl -X POST "https://your-domain.vercel.app/api/sync-notion?secret=YOUR_SYNC_SECRET"
```

Vercel cron jobs automatically send `CRON_SECRET` in the Authorization header, which is also accepted.

## Knowledge Base (Google Drive)

### How it works

1. On the first chat message (or pre-warm), the app fetches all files from the configured Google Drive folder recursively
2. **Google Workspace files** (Docs, Sheets, Slides) are exported as plain text and included in the Gemini system instruction
3. **Binary files** (PDFs, images) are uploaded to the Gemini File API and passed as file parts in the chat history
4. The result is cached in memory for **1 hour**
5. Concurrent requests during a fetch share the same promise (no duplicate fetches)

### Supported file types

- Google Docs, Sheets, Slides (exported to text)
- PDF, plain text, HTML, CSS, CSV, XML, Markdown, RTF
- Images: PNG, JPEG, WebP, HEIC, HEIF
- Unsupported formats (e.g. PPTX, DOCX) are skipped with a warning log

### Cache behavior

- **Document cache**: 1 hour TTL, in-memory, resets on deployment
- **Gemini upload cache**: 47 hours TTL (Gemini expires uploads after 48h)
- **Pre-warm**: triggered on user login and daily at 05:00 UTC via cron

### Updating documents

Add, edit, or remove files in the Google Drive folder. Changes are picked up on the next cache expiration (within 1 hour) or after a redeployment.

## Conversation Starters (Notion)

Starters are fetched from a Notion database and shown as clickable buttons in the chat when no messages exist.

### Sync triggers

There are three ways starters get synced from Notion:

1. **Vercel cron** — Daily at 06:00 UTC (automatic)
2. **Make.com webhook** — On Notion database changes (real-time)
3. **Manual** — Call `/api/sync-notion` with the `SYNC_SECRET`

### Cache behavior

- In-memory cache with 1-hour TTL
- If the cache is expired when a user loads the page, `GET /api/starters` triggers a fresh sync automatically
- Cache resets on deployment

## Make.com Webhook

Make.com is configured to trigger a Notion sync whenever the starters database is updated, providing near-real-time updates without waiting for the daily cron.

### Setup

1. Create a new scenario in Make.com
2. Add a **Notion — Watch Database Items** trigger module
   - Connect your Notion account
   - Select the starters database
   - Set it to watch for created and updated items
3. Add an **HTTP — Make a request** action module
   - **URL**: `https://your-domain.vercel.app/api/sync-notion`
   - **Method**: POST
   - **Headers**: `Authorization: Bearer YOUR_SYNC_SECRET`
4. Turn on the scenario and set the polling interval

When a starter is added, edited, or toggled in Notion, Make.com calls the sync endpoint and the cache is refreshed.

## Cron Jobs

Configured in `vercel.json`:

| Schedule | Path | Purpose |
|----------|------|---------|
| `0 5 * * *` (05:00 UTC daily) | `/api/knowledge-base/warm` | Pre-warm Google Drive document cache |
| `0 6 * * *` (06:00 UTC daily) | `/api/sync-notion` | Sync conversation starters from Notion |

> **Note**: Vercel Hobby plans limit cron jobs to once per day. More frequent schedules will block deployment.

## Local Development

```bash
# Clone the repository
git clone https://github.com/E-Flight-Academy/eflight-virtual-ops.git
cd eflight-virtual-ops

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in all required values in .env.local

# Start the dev server
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### Other commands

```bash
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Deployment

The project deploys automatically to Vercel on push to `main`.

### First-time Vercel setup

1. Import the GitHub repository in Vercel
2. Framework preset: **Next.js** (auto-detected)
3. Add all required environment variables in **Settings > Environment Variables**
4. Set `CRON_SECRET` to enable authenticated cron jobs
5. Deploy

### After deployment

- Cron jobs start running automatically on the configured schedule
- The knowledge base loads on the first user login (or at 05:00 UTC via cron)
- Conversation starters sync daily at 06:00 UTC and on Notion changes via Make.com
- All in-memory caches reset on each new deployment
