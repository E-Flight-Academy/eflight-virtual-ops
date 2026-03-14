"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl", "milos@eflight.nl"];
const ALLOWED_ROLES = ["operations", "instructor"];

// ─── Color system by category ────────────────────────────────────────
const C = {
  user: { bg: "bg-[#1515F5]", text: "text-white", border: "border-[#1515F5]", hex: "#1515F5" },
  app: { bg: "bg-[#F0F0FF]", text: "text-[#1515F5]", border: "border-[#A1A1FB]", hex: "#A1A1FB" },
  ai: { bg: "bg-[#ECD3F4]", text: "text-[#8B2FA8]", border: "border-[#DFB6EE]", hex: "#DFB6EE" },
  data: { bg: "bg-[#DAF4EC]", text: "text-[#1B7A57]", border: "border-[#85D9BF]", hex: "#85D9BF" },
  storage: { bg: "bg-[#DCF9FF]", text: "text-[#0077A3]", border: "border-[#8BEAFF]", hex: "#8BEAFF" },
  auth: { bg: "bg-[#FFF3E0]", text: "text-[#B86E00]", border: "border-[#FFD699]", hex: "#FFD699" },
  internal: { bg: "bg-[#F7F7F7]", text: "text-[#030213]", border: "border-[#ECECEC]", hex: "#ECECEC" },
};

// ─── Reusable diagram box ────────────────────────────────────────────
function Box({
  label,
  sub,
  cat,
  icon,
  className = "",
  highlight,
  onHover,
  id,
  small,
}: {
  label: string;
  sub?: string;
  cat: keyof typeof C;
  icon?: string;
  className?: string;
  highlight?: string | null;
  onHover?: (id: string | null) => void;
  id?: string;
  small?: boolean;
}) {
  const c = C[cat];
  const isHighlighted = !highlight || highlight === id;
  return (
    <div
      className={`${c.bg} ${c.text} border-2 ${c.border} ${small ? "px-2.5 py-1.5 text-xs" : "px-4 py-2.5 text-sm"} rounded-xl font-medium transition-all duration-200 ${isHighlighted ? "opacity-100 scale-100" : "opacity-30 scale-[0.97]"} ${onHover ? "cursor-default" : ""} ${className}`}
      onMouseEnter={() => onHover?.(id ?? null)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="text-base">{icon}</span>}
        <span className="font-semibold">{label}</span>
      </div>
      {sub && <div className={`${small ? "text-[10px]" : "text-xs"} opacity-70 mt-0.5`}>{sub}</div>}
    </div>
  );
}

// ─── Arrow (vertical or horizontal) ─────────────────────────────────
function Arrow({ direction = "down", label, className = "" }: { direction?: "down" | "right" | "left" | "up"; label?: string; className?: string }) {
  if (direction === "right") {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <div className="h-0.5 w-6 bg-[#ABABAB]" />
        <svg width="8" height="12" viewBox="0 0 8 12" className="text-[#ABABAB] shrink-0"><path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {label && <span className="text-[10px] text-e-grey ml-1">{label}</span>}
      </div>
    );
  }
  if (direction === "left") {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <svg width="8" height="12" viewBox="0 0 8 12" className="text-[#ABABAB] shrink-0"><path d="M7 1l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="h-0.5 w-6 bg-[#ABABAB]" />
        {label && <span className="text-[10px] text-e-grey ml-1">{label}</span>}
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center gap-0.5 ${className}`}>
      <div className="w-0.5 h-5 bg-[#ABABAB]" />
      <svg width="12" height="8" viewBox="0 0 12 8" className="text-[#ABABAB]">
        {direction === "up"
          ? <path d="M1 7l5-5 5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          : <path d="M1 1l5 5 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
      {label && <span className="text-[10px] text-e-grey">{label}</span>}
    </div>
  );
}

// ─── Bi-directional arrow ───────────────────────────────────────────
function BiArrow({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center ${className}`}>
      <svg width="8" height="12" viewBox="0 0 8 12" className="text-[#ABABAB] shrink-0"><path d="M7 1l-5 5 5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <div className="h-0.5 flex-1 min-w-3 bg-[#ABABAB]" />
      <svg width="8" height="12" viewBox="0 0 8 12" className="text-[#ABABAB] shrink-0"><path d="M1 1l5 5-5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

// ─── Section wrapper (matches patterns page) ────────────────────────
function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-sm text-e-grey">{description}</p>
      </div>
      <div className="bg-white rounded-xl border border-[#ECECEC] p-6 overflow-x-auto">
        {children}
      </div>
    </section>
  );
}

// ─── Step badge for flow diagrams ───────────────────────────────────
function Step({ n, label, className = "" }: { n: number; label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="w-6 h-6 rounded-full bg-[#1515F5] text-white text-xs font-bold flex items-center justify-center shrink-0">{n}</div>
      <span className="text-sm text-foreground font-medium">{label}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  1. SYSTEM OVERVIEW
// ═══════════════════════════════════════════════════════════════════
function SystemOverview() {
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { cat: "user" as const, label: "User" },
          { cat: "app" as const, label: "Application" },
          { cat: "ai" as const, label: "AI Services" },
          { cat: "data" as const, label: "Data Sources" },
          { cat: "storage" as const, label: "Storage" },
          { cat: "auth" as const, label: "Authentication" },
        ].map((l) => (
          <div key={l.cat} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${C[l.cat].bg} border ${C[l.cat].border}`} />
            <span className="text-e-grey">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Diagram */}
      <div className="flex flex-col items-center gap-2">
        {/* User */}
        <Box label="User" sub="Browser / Mobile" cat="user" icon="👤" id="user" highlight={hover} onHover={setHover} />
        <Arrow />

        {/* App */}
        <Box label="Next.js App" sub="Steward · App Router · TypeScript" cat="app" icon="⚡" id="app" highlight={hover} onHover={setHover} />
        <Arrow />

        {/* Core services row */}
        <div className="flex flex-wrap justify-center gap-3 max-w-2xl">
          <Box label="Gemini AI" sub="2.5 Flash + 2.0 Flash Lite" cat="ai" icon="✨" small id="gemini" highlight={hover} onHover={setHover} />
          <Box label="Upstash Redis" sub="L2 Cache" cat="storage" icon="🗄️" small id="redis" highlight={hover} onHover={setHover} />
          <Box label="Upstash Vector" sub="RAG Embeddings" cat="storage" icon="🔍" small id="vector" highlight={hover} onHover={setHover} />
        </div>

        <Arrow />

        {/* Data sources */}
        <div className="flex flex-wrap justify-center gap-3 max-w-3xl">
          <Box label="Notion" sub="FAQs · Flows · Config" cat="data" icon="📝" small id="notion" highlight={hover} onHover={setHover} />
          <Box label="Wings" sub="Bookings · Docs" cat="data" icon="✈️" small id="wings" highlight={hover} onHover={setHover} />
          <Box label="Shopify" sub="Products · Auth" cat="data" icon="🛒" small id="shopify" highlight={hover} onHover={setHover} />
          <Box label="Google Drive" sub="Documents · SOPs" cat="data" icon="📁" small id="drive" highlight={hover} onHover={setHover} />
          <Box label="Airtable" sub="User Roles" cat="auth" icon="📋" small id="airtable" highlight={hover} onHover={setHover} />
          <Box label="eflight.nl" sub="Website Pages" cat="data" icon="🌐" small id="website" highlight={hover} onHover={setHover} />
          <Box label="Scaleway S3" sub="FAQ Images" cat="storage" icon="🖼️" small id="scaleway" highlight={hover} onHover={setHover} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  2. CHAT REQUEST FLOW
// ═══════════════════════════════════════════════════════════════════
function ChatRequestFlow() {
  return (
    <div className="space-y-4">
      <Step n={1} label="User sends message" />
      <div className="ml-3 pl-5 border-l-2 border-[#ECECEC] space-y-4">
        <Box label="POST /api/chat" sub="{ messages, lang, flowContext, focused }" cat="app" icon="📨" />
        <Arrow />

        <Step n={2} label="Parallel data fetching" />
        <div className="flex flex-wrap gap-2 mt-2">
          <Box label="FAQs" sub="L1→L2→L3" cat="data" icon="❓" small />
          <Box label="RAG Query" sub="Vector search ≥0.65" cat="storage" icon="🔍" small />
          <Box label="Products" sub="Shopify" cat="data" icon="🛒" small />
          <Box label="Website" sub="eflight.nl" cat="data" icon="🌐" small />
          <Box label="Wings Cache" sub="If available" cat="data" icon="✈️" small />
        </div>
        <Arrow />

        <Step n={3} label="Model selection" />
        <div className="flex flex-wrap gap-2 mt-2">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#ECD3F4] border-2 border-[#DFB6EE] text-sm">
            <span className="font-semibold text-[#8B2FA8]">gemini-2.5-flash</span>
            <span className="text-xs opacity-60">all requests · smart · fast</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#ECD3F4]/50 border-2 border-[#DFB6EE]/50 text-sm">
            <span className="font-semibold text-[#8B2FA8]/70">gemini-2.0-flash-lite</span>
            <span className="text-xs opacity-60">translations only</span>
          </div>
        </div>
        <Arrow />

        <Step n={4} label="Build system instruction" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2 text-xs">
          {["Base instructions", "Company context", "FAQ context", "RAG results", "Products", "Schedule cache", "Flow context", "Chat history"].map((s) => (
            <div key={s} className="px-2 py-1.5 rounded-lg bg-[#F7F7F7] border border-[#ECECEC] text-e-grey text-center">{s}</div>
          ))}
        </div>
        <Arrow />

        <Step n={5} label="Stream response" />
        <div className="flex items-center gap-2 flex-wrap mt-2">
          <div className="px-2.5 py-1.5 rounded-lg bg-[#F0F0FF] border border-[#A1A1FB] text-xs text-[#1515F5] font-mono">{"{ progress }"}</div>
          <Arrow direction="right" />
          <div className="px-2.5 py-1.5 rounded-lg bg-[#F0F0FF] border border-[#A1A1FB] text-xs text-[#1515F5] font-mono">{"{ context_sizes }"}</div>
          <Arrow direction="right" />
          <div className="px-2.5 py-1.5 rounded-lg bg-[#F0F0FF] border border-[#A1A1FB] text-xs text-[#1515F5] font-mono">{"{ message chunks }"}</div>
        </div>
        <Arrow />

        <Step n={6} label="Log to Notion" />
        <Box label="POST /api/chat/log" sub="question, answer, source, lang, sessionId" cat="data" icon="📝" small />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  3. CAPABILITY ACTIONS
// ═══════════════════════════════════════════════════════════════════
function CapabilityActions() {
  const [activeTab, setActiveTab] = useState<"gemini" | "direct">("direct");
  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex bg-[#F2F2F2] rounded-lg p-0.5 gap-0.5 max-w-sm">
        <button onClick={() => setActiveTab("gemini")} className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md cursor-pointer transition-colors ${activeTab === "gemini" ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"}`}>
          ✨ Gemini Flow
        </button>
        <button onClick={() => setActiveTab("direct")} className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md cursor-pointer transition-colors ${activeTab === "direct" ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"}`}>
          ⚡ Direct Flow
        </button>
      </div>

      {/* Grid for stable width */}
      <div className="grid">
        {/* Gemini flow */}
        <div className={`col-start-1 row-start-1 ${activeTab !== "gemini" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User types question" cat="user" icon="💬" small />
            <Arrow />
            <Box label="Context gathering" sub="FAQs · RAG · Products · Website" cat="app" icon="📦" small />
            <Arrow />
            <Box label="Gemini AI" sub="System instruction + context + history" cat="ai" icon="✨" small />
            <Arrow />
            <Box label="Streamed text response" sub="NDJSON stream → rendered as markdown" cat="app" icon="📄" small />
            <div className="mt-3 px-3 py-2 rounded-lg bg-[#ECD3F4]/30 border border-[#DFB6EE] text-xs text-[#8B2FA8]">
              💡 AI generates free-form text — variable quality, higher cost (~20K+ tokens)
            </div>
          </div>
        </div>

        {/* Direct flow */}
        <div className={`col-start-1 row-start-1 ${activeTab !== "direct" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User clicks capability button" sub='e.g. "My Schedule"' cat="user" icon="👆" small />
            <Arrow />
            <Box label="POST /api/capability-action" sub="{ action, userEmail }" cat="app" icon="⚡" small />
            <Arrow />
            <Box label="Wings API" sub="Direct data fetch" cat="data" icon="✈️" small />
            <Arrow />
            <div className="flex items-center gap-2 flex-wrap">
              <Box label="Redis Cache" sub="TTL: 30 min" cat="storage" icon="🗄️" small />
              <span className="text-xs text-e-grey">+</span>
              <Box label="React Component" sub="Structured rendering" cat="app" icon="⚛️" small />
            </div>
            <div className="mt-3 px-3 py-2 rounded-lg bg-[#DAF4EC]/50 border border-[#85D9BF] text-xs text-[#1B7A57]">
              ⚡ No AI model needed — direct data rendering. Consistent, fast, cheap.
            </div>
          </div>

          {/* Supported actions */}
          <div className="mt-5 space-y-2">
            <p className="text-xs font-semibold text-e-grey uppercase tracking-wide">Supported actions</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { action: "instructor-schedule", icon: "📅", desc: "Bookings (7d past, 21d future)", component: "ScheduleMessage" },
                { action: "booking-detail", icon: "📋", desc: "Lessons, flights, scores, docs + inferred course context", component: "BookingDetailMessage" },
                { action: "student-lessons", icon: "🎓", desc: "Full lesson history + scores", component: "StudentLessonsMessage" },
                { action: "doc-validity", icon: "📄", desc: "Document expiry & status", component: "DocumentValidityMessage" },
                { action: "lesson-briefing-*", icon: "📖", desc: "AI briefing via multi-step sub-flow (lesson → language → generate)", component: "BriefingMessage" },
                { action: "course-plans", icon: "🗂️", desc: "Lightweight course plan lookup (lazy, for sub-flow enrichment)", component: "—" },
              ].map((a) => (
                <div key={a.action} className="flex items-start gap-2.5 px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC]">
                  <span className="text-base mt-0.5">{a.icon}</span>
                  <div>
                    <div className="text-xs font-semibold font-mono text-foreground">{a.action}</div>
                    <div className="text-[11px] text-e-grey">{a.desc}</div>
                    <div className="text-[10px] text-e-grey-light font-mono mt-0.5">{a.component}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Multi-step sub-flows */}
      <div className="pt-3 border-t border-[#ECECEC] space-y-2">
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide">Multi-step sub-flows</p>
        <div className="flex flex-col items-start gap-2 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <Box label="Card action pill" cat="user" icon="👆" small />
            <Arrow direction="right" />
            <Box label="enrichBookingContext" sub="Lazy fetch course plans" cat="app" icon="🔄" small />
            <Arrow direction="right" />
            <Box label="Step 1: Options" sub="e.g. lesson choice" cat="internal" icon="1️⃣" small />
            <Arrow direction="right" />
            <Box label="Step N: Final" sub="Dispatch action" cat="app" icon="⚡" small />
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC] text-e-grey">
            Bookings without a lesson plan: student history is queried to infer the current course and next lesson from the sequence.
          </div>
        </div>
      </div>

      {/* Follow-up flow */}
      <div className="pt-3 border-t border-[#ECECEC] space-y-2">
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide">Follow-up questions</p>
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-e-grey">After capability action:</span>
          <Box label="Redis cached data" cat="storage" icon="🗄️" small />
          <Arrow direction="right" />
          <span className="text-e-grey">injected as</span>
          <Arrow direction="right" />
          <Box label="Gemini context" cat="ai" icon="✨" small />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  4. CACHING ARCHITECTURE
// ═══════════════════════════════════════════════════════════════════
function CachingArchitecture() {
  const ttls = [
    { source: "FAQs, Flows, Config, Roles", ttl: "1 hour" },
    { source: "Website, Products", ttl: "6 hours" },
    { source: "Gemini file URIs", ttl: "47 hours" },
    { source: "Wings schedule/lessons", ttl: "30 min" },
    { source: "Course plans", ttl: "24 hours" },
    { source: "Translations, Shared chats", ttl: "30 days" },
    { source: "FAQ images (Scaleway S3)", ttl: "Permanent" },
  ];

  return (
    <div className="space-y-6">
      {/* 3-layer diagram */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-full max-w-lg">
          {/* L1 */}
          <div className="border-2 border-[#A1A1FB] rounded-xl p-4 bg-[#F0F0FF]/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#1515F5] text-white text-xs font-bold flex items-center justify-center">L1</div>
                <div>
                  <div className="text-sm font-semibold text-foreground">In-Memory</div>
                  <div className="text-xs text-e-grey">Node.js process · ~0ms</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1515F5] text-white font-medium">Fastest</span>
            </div>
            <div className="text-[11px] text-e-grey">Lost on container restart. Per-instance, not shared.</div>

            <Arrow className="my-2" />
            <div className="text-[10px] text-center text-e-grey italic mb-2">cache miss ↓</div>

            {/* L2 */}
            <div className="border-2 border-[#8BEAFF] rounded-xl p-4 bg-[#DCF9FF]/50">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0077A3] text-white text-xs font-bold flex items-center justify-center">L2</div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Upstash Redis</div>
                    <div className="text-xs text-e-grey">Serverless · ~5ms · TTL-based</div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0077A3] text-white font-medium">Shared</span>
              </div>
              <div className="text-[11px] text-e-grey">Survives restarts. Shared across instances.</div>

              <Arrow className="my-2" />
              <div className="text-[10px] text-center text-e-grey italic mb-2">cache miss ↓</div>

              {/* L3 */}
              <div className="border-2 border-[#85D9BF] rounded-xl p-4 bg-[#DAF4EC]/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#1B7A57] text-white text-xs font-bold flex items-center justify-center">L3</div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Source APIs</div>
                      <div className="text-xs text-e-grey">Notion · Shopify · Drive · Wings</div>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#1B7A57] text-white font-medium">Origin</span>
                </div>
                <div className="text-[11px] text-e-grey">Authoritative data. Accessed on sync or cache miss.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Write-back */}
        <div className="flex items-center gap-2 mt-2">
          <Arrow direction="up" />
          <span className="text-xs text-e-grey">Write back to L2 + L1 on fetch</span>
        </div>
      </div>

      {/* TTL table */}
      <div>
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide mb-2">Cache TTLs</p>
        <div className="grid gap-1">
          {ttls.map((t) => (
            <div key={t.source} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-[#F7F7F7] text-xs">
              <span className="text-foreground">{t.source}</span>
              <span className="font-mono text-e-grey font-medium">{t.ttl}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  5. RAG PIPELINE
// ═══════════════════════════════════════════════════════════════════
function RagPipeline() {
  const [activePhase, setActivePhase] = useState<"sync" | "query">("query");
  const namespaces = [
    { name: "drive", label: "Google Drive", chunks: "~790", desc: "SOPs, manuals, checklists" },
    { name: "website", label: "eflight.nl", chunks: "~87", desc: "Public website pages" },
    { name: "faq", label: "FAQs", chunks: "~99", desc: "All languages combined" },
  ];

  return (
    <div className="space-y-4">
      {/* Phase switcher */}
      <div className="flex bg-[#F2F2F2] rounded-lg p-0.5 gap-0.5 max-w-xs">
        <button onClick={() => setActivePhase("sync")} className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md cursor-pointer transition-colors ${activePhase === "sync" ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"}`}>
          🔄 Sync Phase
        </button>
        <button onClick={() => setActivePhase("query")} className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md cursor-pointer transition-colors ${activePhase === "query" ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"}`}>
          🔍 Query Phase
        </button>
      </div>

      {/* Grid for stable width */}
      <div className="grid">
        {/* Sync phase */}
        <div className={`col-start-1 row-start-1 ${activePhase !== "sync" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <div className="flex flex-wrap gap-2">
              <Box label="Google Drive" sub="Documents" cat="data" icon="📁" small />
              <Box label="eflight.nl" sub="Website" cat="data" icon="🌐" small />
              <Box label="Notion" sub="FAQs" cat="data" icon="📝" small />
            </div>
            <Arrow />
            <Box label="Chunk" sub="~800 tokens per chunk · sentence/paragraph boundaries" cat="internal" icon="✂️" small />
            <Arrow />
            <Box label="Embed" sub="gemini-embedding-001 · 768 dimensions" cat="ai" icon="🧮" small />
            <Arrow />
            <Box label="Upstash Vector" sub="Cosine similarity · 3 namespaces" cat="storage" icon="📐" small />

            <div className="mt-4 pt-3 border-t border-[#ECECEC]">
              <div className="text-[11px] font-semibold text-foreground mb-2">FAQ Image Pipeline</div>
              <div className="flex flex-col items-start gap-2">
                <Box label="Notion page blocks" sub="Extract image blocks per FAQ" cat="data" icon="🖼️" small />
                <Arrow />
                <Box label="Mirror to Scaleway S3" sub="Notion URLs expire ~1hr → permanent S3 URLs" cat="storage" icon="☁️" small />
                <Arrow />
                <Box label="Store URL in FAQ data" sub="Rendered as markdown images in chat" cat="internal" icon="📎" small />
              </div>
            </div>

            <div className="mt-3 px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC] text-xs text-e-grey">
              Triggered daily via <span className="font-mono">POST /api/sync-notion</span> (06:00 UTC) or manually
            </div>
          </div>
        </div>

        {/* Query phase */}
        <div className={`col-start-1 row-start-1 ${activePhase !== "query" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User question" sub='"What does my PPL training cost?"' cat="user" icon="💬" small />
            <Arrow />
            <Box label="Embed question" sub="gemini-embedding-001 → 768-dim vector" cat="ai" icon="🧮" small />
            <Arrow />
            <Box label="Vector similarity search" sub="Cosine similarity ≥ 0.65 threshold" cat="storage" icon="🔍" small />
            <Arrow />
            <Box label="Top relevant chunks" sub="Ranked by relevance score" cat="internal" icon="📊" small />
            <Arrow />
            <Box label="Inject into Gemini context" sub="Only relevant content, not everything" cat="ai" icon="✨" small />

            <div className="mt-3 px-3 py-2 rounded-lg bg-[#DAF4EC]/50 border border-[#85D9BF] text-xs text-[#1B7A57]">
              💡 Without RAG: ~60K+ tokens per message. With RAG: ~20-25K tokens. Saves cost and improves quality.
            </div>
          </div>
        </div>
      </div>

      {/* Namespaces */}
      <div>
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide mb-2">Vector namespaces</p>
        <div className="grid grid-cols-3 gap-2">
          {namespaces.map((ns) => (
            <div key={ns.name} className="px-3 py-2.5 rounded-lg bg-[#DCF9FF]/50 border border-[#8BEAFF] text-center">
              <div className="text-lg font-bold text-[#0077A3]">{ns.chunks}</div>
              <div className="text-xs font-semibold text-foreground">{ns.label}</div>
              <div className="text-[10px] text-e-grey mt-0.5">{ns.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  6. AUTH & ROLES
// ═══════════════════════════════════════════════════════════════════
function AuthRoles() {
  return (
    <div className="space-y-6">
      {/* OAuth flow */}
      <div>
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide mb-3">Shopify OAuth2 PKCE Flow</p>
        <div className="flex items-center gap-2 flex-wrap">
          <Box label="Login" cat="user" icon="🔑" small />
          <Arrow direction="right" />
          <Box label="Shopify" sub="OAuth2 PKCE" cat="auth" icon="🛒" small />
          <Arrow direction="right" />
          <Box label="Callback" sub="/api/auth/shopify/callback" cat="app" icon="🔄" small />
          <Arrow direction="right" />
          <Box label="Session Cookie" sub="HMAC-signed" cat="internal" icon="🍪" small />
        </div>
      </div>

      {/* Role resolution */}
      <div>
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide mb-3">Role Resolution</p>
        <div className="flex flex-col items-start gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Box label="Session email" cat="app" icon="📧" small />
            <Arrow direction="right" />
            <div className="flex flex-col gap-1">
              <Box label="Airtable Customers" sub="Wings Role (multi-select)" cat="auth" icon="📋" small />
              <Box label="Airtable Instructors" sub="All Roles (text) + Wings ID" cat="auth" icon="✈️" small />
            </div>
            <Arrow direction="right" />
            <div className="flex flex-wrap gap-1.5">
              {["student", "instructor", "renter", "operations"].map((r) => (
                <span key={r} className="px-2 py-1 rounded-full bg-[#DAF4EC] border border-[#85D9BF] text-xs font-medium text-[#1B7A57]">{r}</span>
              ))}
            </div>
          </div>
          <Arrow />
          <div className="flex items-center gap-2 flex-wrap">
            <Box label="Notion Role Access" sub="Role → Capabilities + Folders" cat="data" icon="📝" small />
            <Arrow direction="right" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-e-grey font-medium">Capabilities →</span>
                <div className="flex flex-wrap gap-1">
                  {["schedule", "heliox", "doc-validity"].map((c) => (
                    <span key={c} className="px-2 py-0.5 rounded bg-[#F0F0FF] border border-[#A1A1FB] text-[10px] font-mono text-[#1515F5]">{c}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-e-grey font-medium">Folders →</span>
                <div className="flex flex-wrap gap-1">
                  {["public", "student", "instructor"].map((f) => (
                    <span key={f} className="px-2 py-0.5 rounded bg-[#F7F7F7] border border-[#ECECEC] text-[10px] font-mono text-foreground">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Access control */}
      <div>
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide mb-3">Access Control</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC]">
            <div className="font-semibold text-foreground">Capabilities</div>
            <div className="text-e-grey mt-0.5">Filter flow buttons + enable capability actions. Only users with matching capability see the button.</div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC]">
            <div className="font-semibold text-foreground">Folders</div>
            <div className="text-e-grey mt-0.5">Filter Google Drive documents in RAG results. Role determines which folders are searchable.</div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC]">
            <div className="font-semibold text-foreground">FAQ Filtering</div>
            <div className="text-e-grey mt-0.5">FAQs with Role relation are only shown to matching roles. No role = public.</div>
          </div>
          <div className="px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC]">
            <div className="font-semibold text-foreground">Debug Overrides</div>
            <div className="text-e-grey mt-0.5">Admin emails can impersonate users and override roles via ?user= and ?role= params.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  7. USER INTERACTION PATHS
// ═══════════════════════════════════════════════════════════════════
function InteractionPaths() {
  const [activePath, setActivePath] = useState<"chat" | "flow-faq" | "flow-ai" | "capability">("chat");

  const paths = [
    { id: "chat" as const, label: "Chat / FAQ", icon: "💬" },
    { id: "flow-faq" as const, label: "Flow → FAQ", icon: "📋" },
    { id: "flow-ai" as const, label: "Flow → AI", icon: "✨" },
    { id: "capability" as const, label: "Action", icon: "⚡" },
  ];

  return (
    <div className="space-y-4">
      {/* Path switcher */}
      <div className="flex bg-[#F2F2F2] rounded-lg p-0.5 gap-0.5">
        {paths.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePath(p.id)}
            className={`flex-1 text-xs font-medium py-1.5 px-2 rounded-md cursor-pointer transition-colors ${activePath === p.id ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"}`}
          >
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      <div className="grid">
        {/* Path 1: Chat / FAQ click */}
        <div className={`col-start-1 row-start-1 ${activePath !== "chat" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User types question or clicks FAQ" sub="Free text input or FAQ modal selection" cat="user" icon="💬" small />
            <Arrow />
            <Box label="findInstantAnswer()" sub="Exact match against local FAQ list" cat="app" icon="🔍" small />
            <Arrow />
            <div className="flex gap-4 flex-wrap">
              <div className="flex flex-col items-start gap-2 px-3 py-3 rounded-xl bg-[#DAF4EC]/30 border border-[#85D9BF]">
                <div className="text-xs font-semibold text-[#1B7A57]">Match found</div>
                <Box label="Show FAQ answer directly" sub="No Gemini call — instant response" cat="internal" icon="✅" small />
              </div>
              <div className="flex flex-col items-start gap-2 px-3 py-3 rounded-xl bg-[#ECD3F4]/30 border border-[#DFB6EE]">
                <div className="text-xs font-semibold text-[#8B2FA8]">No match</div>
                <Box label="POST /api/chat" sub="Full Gemini flow with context" cat="ai" icon="✨" small />
              </div>
            </div>
            <div className="mt-2 px-3 py-2 rounded-lg bg-[#F7F7F7] border border-[#ECECEC] text-xs text-e-grey">
              FAQ modal clicks pass the exact question text → always matched instantly. Free-text questions only go through Gemini when no exact FAQ match exists.
            </div>
          </div>
        </div>

        {/* Path 2: Guided Flow → FAQ */}
        <div className={`col-start-1 row-start-1 ${activePath !== "flow-faq" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User clicks flow button" sub="Guided conversation step" cat="user" icon="👆" small />
            <Arrow />
            <Box label="Flow step with Related FAQ" sub="Notion relation to FAQ database" cat="data" icon="📝" small />
            <Arrow />
            <Box label="relatedFaqAnswer" sub="Pre-fetched FAQ answer from Notion sync" cat="app" icon="📄" small />
            <Arrow />
            <Box label="Show answer directly" sub="With [source: FAQ] attribution" cat="internal" icon="✅" small />
            <div className="mt-2 px-3 py-2 rounded-lg bg-[#DAF4EC]/50 border border-[#85D9BF] text-xs text-[#1B7A57]">
              ⚡ No Gemini call — FAQ answer is pre-loaded during sync and displayed directly.
            </div>
          </div>
        </div>

        {/* Path 3: Guided Flow → AI Chat */}
        <div className={`col-start-1 row-start-1 ${activePath !== "flow-ai" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User clicks flow button" sub="Guided conversation step" cat="user" icon="👆" small />
            <Arrow />
            <Box label="endAction: Start AI Chat" sub="Flow step with endPrompt context" cat="app" icon="🎯" small />
            <Arrow />
            <Box label="POST /api/chat (focused)" sub="endPrompt as system context · gemini-2.0-flash" cat="ai" icon="✨" small />
            <Arrow />
            <Box label="Streamed AI response" sub="Focused answer with flow context" cat="app" icon="📄" small />
            <div className="mt-2 px-3 py-2 rounded-lg bg-[#ECD3F4]/30 border border-[#DFB6EE] text-xs text-[#8B2FA8]">
              💡 Uses focused mode (gemini-2.0-flash) — faster and cheaper than normal chat.
            </div>
          </div>
        </div>

        {/* Path 4: Capability Action */}
        <div className={`col-start-1 row-start-1 ${activePath !== "capability" ? "h-0 overflow-hidden invisible" : ""}`}>
          <div className="flex flex-col items-start gap-2">
            <Box label="User clicks capability button" sub='e.g. "My Schedule", "Document validity"' cat="user" icon="👆" small />
            <Arrow />
            <Box label="POST /api/capability-action" sub="{ action, userEmail }" cat="app" icon="⚡" small />
            <Arrow />
            <Box label="Wings / Airtable API" sub="Direct data fetch" cat="data" icon="✈️" small />
            <Arrow />
            <div className="flex items-center gap-2 flex-wrap">
              <Box label="Redis Cache" sub="TTL: 30 min" cat="storage" icon="🗄️" small />
              <span className="text-xs text-e-grey">+</span>
              <Box label="React Component" sub="ScheduleMessage, BookingDetail, etc." cat="app" icon="⚛️" small />
            </div>
            <div className="mt-2 px-3 py-2 rounded-lg bg-[#DAF4EC]/50 border border-[#85D9BF] text-xs text-[#1B7A57]">
              ⚡ No AI model needed — direct API call rendered as structured React component.
            </div>
          </div>
        </div>
      </div>

      {/* Summary comparison */}
      <div className="pt-3 border-t border-[#ECECEC]">
        <p className="text-xs font-semibold text-e-grey uppercase tracking-wide mb-2">Comparison</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { path: "Chat/FAQ", ai: "Only if no match", speed: "Fast → Medium", cost: "Free → ~20K tokens" },
            { path: "Flow → FAQ", ai: "None", speed: "Instant", cost: "Free" },
            { path: "Flow → AI", ai: "Focused (2.0-flash)", speed: "Medium", cost: "~15K tokens" },
            { path: "Capability", ai: "None", speed: "Fast", cost: "Free (API only)" },
          ].map((c) => (
            <div key={c.path} className="px-3 py-2.5 rounded-lg bg-[#F7F7F7] border border-[#ECECEC] text-center space-y-1">
              <div className="text-xs font-semibold text-foreground">{c.path}</div>
              <div className="text-[10px] text-e-grey">AI: {c.ai}</div>
              <div className="text-[10px] text-e-grey">Speed: {c.speed}</div>
              <div className="text-[10px] text-e-grey">Cost: {c.cost}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Navigation bar ─────────────────────────────────────────────────
function DocsNav({ active }: { active: "architecture" | "patterns" | "discovery" }) {
  const items = [
    { href: "/architecture", label: "Architecture", id: "architecture" as const },
    { href: "/patterns", label: "Patterns", id: "patterns" as const },
    { href: "/discovery", label: "Discovery", id: "discovery" as const },
  ];
  return (
    <div className="flex items-center gap-3">
      <Link href="/" className="text-sm text-e-grey hover:text-e-indigo transition-colors no-underline">← Steward</Link>
      <div className="flex gap-1 bg-[#F2F2F2] rounded-lg p-0.5">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={`text-sm font-medium px-4 py-1.5 rounded-md transition-colors no-underline ${active === item.id ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"}`}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function ArchitecturePage() {
  const [authState, setAuthState] = useState<"loading" | "denied" | "allowed">("loading");

  useEffect(() => {
    if (process.env.NODE_ENV === "development") { setAuthState("allowed"); return; }
    fetch("/api/auth/shopify/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) {
          setAuthState("denied");
          return;
        }
        const email = (data.customer?.email || "").toLowerCase();
        const roles: string[] = (data.roles || []).map((r: string) => r.toLowerCase());
        const isAdmin = ADMIN_EMAILS.includes(email);
        const hasRole = roles.some((r) => ALLOWED_ROLES.includes(r));
        setAuthState(isAdmin || hasRole ? "allowed" : "denied");
      })
      .catch(() => setAuthState("denied"));
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-e-grey text-sm">Loading...</div>
      </div>
    );
  }

  if (authState === "denied") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="text-4xl">🔒</div>
          <h1 className="text-xl font-bold text-foreground">Access Restricted</h1>
          <p className="text-sm text-e-grey">This page is only available to E-Flight staff and instructors.</p>
          <Link href="/" className="inline-block text-sm text-e-indigo hover:underline mt-2">← Back to Steward</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8 fixed inset-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <DocsNav active="architecture" />
          <h1 className="text-3xl font-bold text-e-indigo-dark mb-2 mt-6">Steward Architecture</h1>
          <p className="text-e-grey">Interactive overview of how Steward works — data flows, caching, AI, and authentication.</p>
        </div>

        <Section title="1. System Overview" description="High-level view of all components and how they connect.">
          <SystemOverview />
        </Section>

        <Section title="2. Chat Request Flow" description="What happens when a user sends a message — from POST to streamed response.">
          <ChatRequestFlow />
        </Section>

        <Section title="3. Capability Actions" description="Direct API calls vs Gemini — two paths for handling user requests.">
          <CapabilityActions />
        </Section>

        <Section title="4. Caching Architecture" description="Three-layer caching strategy to minimize latency and API calls.">
          <CachingArchitecture />
        </Section>

        <Section title="5. RAG Pipeline" description="How documents are chunked, embedded, and queried for relevant context.">
          <RagPipeline />
        </Section>

        <Section title="6. Authentication & Roles" description="Shopify OAuth, role resolution, and access control.">
          <AuthRoles />
        </Section>

        <Section title="7. User Interaction Paths" description="Four ways users interact with Steward — from free chat to direct API actions.">
          <InteractionPaths />
        </Section>
      </div>
    </div>
  );
}
