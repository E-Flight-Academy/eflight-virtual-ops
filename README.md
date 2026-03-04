# E-Flight Virtual Ops

AI-powered chat assistant for E-Flight Academy. Answers questions from students, instructors, and visitors about flight training operations using documents from a Google Drive knowledge base.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with E-Flight brand colors
- **AI**: Google Gemini 2.0 Flash Lite
- **Knowledge Base**: Google Drive + Gemini File API
- **Conversation Starters**: Notion database
- **Deployment**: Scaleway Serverless Containers

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
- **`starters.ts`** — Fetches conversation starters from a Notion database, filtered by "Show as Starter" checkbox and sorted by "Order" property. L1 in-memory + L2 Redis cache with 1-hour TTL.

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
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Redis REST URL for caching |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Redis REST token |

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
| POST/GET | `/api/sync-notion` | `SYNC_SECRET` | Sync starters from Notion |

### Sync-notion authentication

The `/api/sync-notion` endpoint accepts the `SYNC_SECRET` token in two ways:

```bash
# Via Authorization header
curl -X POST https://steward.eflight.nl/api/sync-notion \
  -H "Authorization: Bearer YOUR_SYNC_SECRET"

# Via query parameter
curl -X POST "https://steward.eflight.nl/api/sync-notion?secret=YOUR_SYNC_SECRET"
```

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

- **L1 (in-memory)**: 1 hour TTL, resets on deployment
- **L2 (Redis)**: 1 hour TTL, persists across deployments
- **Gemini upload cache**: 47 hours TTL (Gemini expires uploads after 48h)
- **Pre-warm**: triggered automatically after deploy and daily at 05:00 UTC via cron

### Updating documents

Add, edit, or remove files in the Google Drive folder. Changes are picked up on the next cache expiration (within 1 hour) or after a redeployment.

## Conversation Starters (Notion)

Starters are fetched from a Notion database and shown as clickable buttons in the chat when no messages exist.

### Sync triggers

1. **GitHub Actions cron** — Daily at 06:00 UTC (automatic)
2. **Make.com webhook** — On Notion database changes (real-time)
3. **Manual** — Call `/api/sync-notion` with the `SYNC_SECRET`

### Cache behavior

- L1 in-memory + L2 Redis cache with 1-hour TTL
- If cache is expired, `GET /api/starters` triggers a fresh sync automatically
- L1 resets on deployment, L2 persists

## Cron Jobs

Configured in `.github/workflows/cron.yml`:

| Schedule | Path | Purpose |
|----------|------|---------|
| `0 5 * * *` (05:00 UTC daily) | `/api/knowledge-base/warm` | Pre-warm Google Drive document cache |
| `0 6 * * *` (06:00 UTC daily) | `/api/sync-notion` | Sync conversation starters from Notion |

## Local Development

```bash
# Clone the repository
git clone https://github.com/E-Flight-Academy/Steward.git
cd Steward

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

The project deploys automatically to Scaleway on push to `main` via GitHub Actions (`.github/workflows/deploy.yml`).

### How it works

1. Docker image is built with the commit SHA baked in
2. Image is pushed to Scaleway Container Registry (`rg.nl-ams.scw.cloud/steward/steward`)
3. Serverless Container is redeployed with the new image
4. After deploy, the knowledge base is automatically warmed up

### After deployment

- The knowledge base is pre-warmed automatically (guided flows, starters, documents)
- Cron jobs run via GitHub Actions on the configured schedule
- L1 (in-memory) caches reset, L2 (Redis) caches persist
