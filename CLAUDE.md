# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

E-Flight Virtual Ops is an AI-powered chat assistant for E-Flight Academy. It answers questions from students, instructors, and visitors about flight training operations.

## Tech Stack

- Next.js 16 with App Router
- TypeScript
- Tailwind CSS v4
- Google Gemini API for AI responses
- Deployed on Vercel

## Development Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run ESLint
```

## Environment Variables

Copy `.env.example` to `.env.local` and set:
- `GEMINI_API_KEY` - Google Gemini API key (get from https://aistudio.google.com/apikey)

## Architecture

```
src/
├── app/
│   ├── api/chat/route.ts   # Gemini chat API endpoint
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page (chat interface)
│   └── globals.css         # Global styles
└── components/
    └── Chat.tsx            # Chat interface component
```

The chat flow:
1. User sends message via Chat component
2. POST request to `/api/chat` with message history
3. API route forwards to Gemini API with conversation context
4. Response streamed back to Chat component
