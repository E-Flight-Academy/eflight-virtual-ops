"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const ADMIN_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl", "milos@eflight.nl"];
const ALLOWED_ROLES = ["operations", "instructor"];

// ─── Nav ────────────────────────────────────────────────────────────
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

// ─── Types ──────────────────────────────────────────────────────────
type Effort = "S" | "M" | "H";
type Role = "instructeur" | "student" | "beide" | "systeem";

interface Solution {
  title: string;
  effort: Effort;
  impact: Effort;
  source: string;
  note: string;
}

interface Opportunity {
  id: number;
  title: string;
  description: string;
  solutions: Solution[];
}

interface Hypothesis {
  h: string;
  test: string;
}

interface Feature {
  id: string;
  label: string;
  role: Role;
  votes: number | null;
  priority: number;
  status: string;
  statusColor: string;
  userRequest?: boolean;
  outcome: { title: string; metric: string };
  opportunities: Opportunity[];
  mvp: string[];
  outOfScope: string;
  hypotheses: Hypothesis[];
}

// ─── Data ───────────────────────────────────────────────────────────
const features: Feature[] = [
  {
    id: "remarks",
    label: "Lesson Briefing", role: "instructeur",
    votes: 5, priority: 1, status: "Live", statusColor: "#3b82f6",
    outcome: {
      title: "Instructor sees at a glance the full lesson history of a student before the lesson, plus a ready-made summary of what they will do today and why — without opening gradesheets themselves",
      metric: "Less prep time • No missed points of attention • Instructor enters the briefing well-prepared"
    },
    opportunities: [
      {
        id: 1, title: "Last 5 lessons with comments per instructor",
        description: "Instructor has to open each gradesheet separately to get a picture of the student — they want only the last 5 lessons with the actual comments and which instructor flew each lesson",
        solutions: [
          { title: "Airtable: last 5 gradesheets per student", effort: "M", impact: "H", source: "Airtable REST API", note: "Date, instructor name, lesson type, and full comments per lesson" },
          { title: "Show actual comments per lesson (not just grades)", effort: "S", impact: "H", source: "Airtable REST API", note: "Interview insight: instructors want to read the real remarks, not just scores" },
          { title: "Show instructor name per lesson", effort: "S", impact: "H", source: "Airtable relation", note: "Interview: critical when student flies with multiple instructors — they want to know who wrote what" }
        ]
      },
      {
        id: 2, title: "AI summary with verifiability",
        description: "Instructors want a summary of what to work on, but are afraid of missing information — they need to be able to compare the summary against the actual comments",
        solutions: [
          { title: "AI summary: focus points for next lesson", effort: "S", impact: "H", source: "Gemini + comments history", note: "Main output: what to work on with this student today and why" },
          { title: "Side-by-side: summary vs. original comments", effort: "M", impact: "H", source: "UI component", note: "Interview insight: instructors don't trust AI blindly — they want to verify the summary is complete" },
          { title: "Expandable comments per lesson below the summary", effort: "S", impact: "H", source: "UI component", note: "Collapsed by default, expandable to check — builds trust over time" }
        ]
      },
      {
        id: 3, title: "Retrieve student remarks",
        description: "Individual remarks and notes are scattered",
        solutions: [
          { title: "Airtable remarks query", effort: "S", impact: "H", source: "Airtable REST API", note: "Linked to student profile" },
          { title: "AI clustering of remarks", effort: "S", impact: "M", source: "Gemini", note: "Group thematically: nav, procedures, airmanship" }
        ]
      },
      {
        id: 4, title: "Aircraft status",
        description: "Technical remarks are not always visible to the instructor",
        solutions: [
          { title: "Manual tech remarks in Airtable", effort: "M", impact: "M", source: "Airtable", note: "Simplest v1 approach" },
          { title: "Tech log integration (v2)", effort: "H", impact: "H", source: "External system", note: "MEL, squawks, limitations" }
        ]
      }
    ],
    mvp: [
      "Airtable: fetch last 5 gradesheets per student with full comments",
      "Per lesson: date, instructor name, lesson type, comments",
      "AI summary: what to work on today and why (based on comments history)",
      "Expandable original comments below summary for verification",
      "Aircraft: manual remarks from Airtable"
    ],
    outOfScope: "Editable lesson planner UI and tech log integration — first validate that the summary is accurate and trusted by instructors.",
    hypotheses: [
      { h: "5 lessons is the right window — instructors don't need more context", test: "Validated in interview (Peter): 5 lessons is what they want" },
      { h: "Instructors don't trust AI summaries unless they can verify against the original comments", test: "Validated in interview (Peter): they want to compare summary with actual remarks" },
      { h: "Knowing which instructor wrote each comment is essential for interpreting the remarks", test: "Validated in interview (Peter): instructor name per lesson is a must-have" },
      { h: "The summary is immediately usable without editing", test: "Have 2 instructors use the output in a real lesson — how much do they modify it?" }
    ]
  },
  {
    id: "pre-lesson-checklist",
    label: "Pre-lesson Checklist", role: "instructeur",
    votes: null, priority: 1, status: "Backlog", statusColor: "#f59e0b",
    userRequest: true,
    outcome: {
      title: "Instructor can see the checklist items for the upcoming lesson before creating it in Wings — so they know what to prepare and assess without having to open Wings first",
      metric: "No surprise checklist items during the lesson • Better preparation • Less time in Wings before the briefing"
    },
    opportunities: [
      {
        id: 1, title: "Checklist items not visible until lesson is created",
        description: "In Wings, checklist items for a lesson type only appear after the lesson booking is created — instructors want to see them beforehand to prepare",
        solutions: [
          { title: "Fetch checklist items from Wings by lesson type", effort: "S", impact: "H", source: "Wings API", note: "Interview insight (Peter): checklist items exist in Wings per lesson type — fetch them before the lesson is created" },
          { title: "Show checklist in Lesson Briefing component", effort: "S", impact: "H", source: "UI component", note: "Display checklist items alongside the lesson summary — natural place for pre-lesson prep" },
          { title: "Link checklist to syllabus requirements", effort: "M", impact: "M", source: "Wings API + course plan", note: "Show which syllabus exercise each checklist item relates to" }
        ]
      },
      {
        id: 2, title: "Checklist varies per lesson type",
        description: "Different lesson types (solo, dual, nav, night) have different checklists — the right one must be shown",
        solutions: [
          { title: "Auto-detect lesson type from Wings booking", effort: "S", impact: "H", source: "Wings API", note: "Next scheduled booking determines which checklist to show" },
          { title: "Manual lesson type selection as fallback", effort: "S", impact: "M", source: "UI dropdown", note: "If no booking exists yet, instructor picks the lesson type" }
        ]
      }
    ],
    mvp: [
      "Fetch checklist items from Wings API by lesson type",
      "Auto-detect lesson type from next scheduled booking",
      "Show checklist in Lesson Briefing before lesson creation",
      "Manual lesson type picker as fallback"
    ],
    outOfScope: "Editable checklists or custom checklist items — Wings is the source of truth. Pre-filling checklist scores — that stays in Wings.",
    hypotheses: [
      { h: "Instructors regularly encounter unexpected checklist items because they haven't seen them before the lesson", test: "Validated in interview (Peter): currently only visible after creating the lesson in Wings" },
      { h: "Showing the checklist beforehand improves lesson preparation quality", test: "Have 2 instructors use pre-lesson checklist for a week — do they feel better prepared?" },
      { h: "The Wings API exposes checklist items per lesson type without creating a booking", test: "Test Wings API: can we fetch checklist definitions by lesson/exercise type?" }
    ]
  },
  {
    id: "daily-briefing",
    label: "Daily Briefing", role: "instructeur",
    votes: null, priority: 1, status: "Priority", statusColor: "#22c55e",
    userRequest: true,
    outcome: {
      title: "Instructor receives every morning (or every 2 hours) a personalized briefing with weather, upcoming lessons, airport updates, and student points of attention",
      metric: "Instructor starts the day fully informed • Fewer separate information lookups"
    },
    opportunities: [
      {
        id: 1, title: "Tailored weather overview",
        description: "Instructor has to check multiple sources themselves for flight-relevant weather",
        solutions: [
          { title: "KNMI API: wind, visibility, cloud base EHTE", effort: "M", impact: "H", source: "KNMI open data", note: "Formatted for flight operations" },
          { title: "Go/No-Go per planned lesson", effort: "S", impact: "H", source: "Threshold logic", note: "Red/orange/green per student type" },
          { title: "Forecast next 4 hours", effort: "S", impact: "M", source: "KNMI TAF/METAR", note: "Relevant for bihourly update" }
        ]
      },
      {
        id: 2, title: "Upcoming lessons overview",
        description: "Instructor has no combined daily overview",
        solutions: [
          { title: "Airtable: today's lessons per instructor", effort: "M", impact: "H", source: "Airtable REST API", note: "Filtered by role — own lessons" },
          { title: "Per lesson: student + aircraft + notes", effort: "S", impact: "H", source: "Link with remarks feature", note: "Builds on Lesson Briefing" }
        ]
      },
      {
        id: 3, title: "Airport notices (NOTAMs / local)",
        description: "Local notices are not always communicated",
        solutions: [
          { title: "Manual NOTAM entry by dispatcher", effort: "S", impact: "M", source: "Notion or Airtable", note: "Simplest v1" },
          { title: "Automatic NOTAM feed (v2)", effort: "H", impact: "H", source: "EAD / EUROCONTROL API", note: "Out of scope v1" }
        ]
      },
      {
        id: 4, title: "Briefing timing and delivery",
        description: "When and how does the instructor receive the briefing?",
        solutions: [
          { title: "On request via Steward chat", effort: "S", impact: "H", source: "Chat interface", note: "'Give me my daily briefing' — v1" },
          { title: "Automatic push when app opens", effort: "M", impact: "H", source: "Next.js / PWA", note: "Briefing as start screen" },
          { title: "Bihourly automatic (v2)", effort: "H", impact: "M", source: "Cron job + notification", note: "Only valuable when weather changes quickly" }
        ]
      }
    ],
    mvp: [
      "On request via chat: 'give me my daily briefing'",
      "KNMI weather overview + go/no-go per planned lesson",
      "Airtable: today's upcoming lessons with student + aircraft",
      "Manual airport notices (NOTAM entry via Notion)",
      "Student points of attention linked from Lesson Briefing"
    ],
    outOfScope: "Automatic push notifications, bihourly cron job, automatic NOTAM feed — first validate that the content is correct and being used.",
    hypotheses: [
      { h: "Instructors want to actively request the briefing, not have it automatically pushed", test: "Build the on-demand version first — measure how often it's used" },
      { h: "Weather + lessons + notices is the right combination — no more, no less", test: "Ask after 1 week: is anything missing? Is there anything you don't use?" },
      { h: "Bihourly update adds value over daily", test: "Run daily first — only upgrade when instructors ask for it themselves" }
    ]
  },
  {
    id: "progress",
    label: "Student Progress", role: "instructeur",
    votes: 5, priority: 1, status: "Priority", statusColor: "#22c55e",
    outcome: {
      title: "Instructor gets a quick summary of the total progress of a student based on all report cards",
      metric: "Less time searching • Better preparation for evaluation conversations"
    },
    opportunities: [
      {
        id: 1, title: "Summarize report cards per student",
        description: "Instructor has to manually scroll through all report cards for a complete picture",
        solutions: [
          { title: "Fetch Airtable report cards", effort: "M", impact: "H", source: "Airtable REST API", note: "All entries per student" },
          { title: "AI progress analysis", effort: "S", impact: "H", source: "Gemini", note: "Trends, areas for improvement, strong points" },
          { title: "Visual progress indicator (v2)", effort: "M", impact: "M", source: "UI component", note: "Per skill area" }
        ]
      },
      {
        id: 2, title: "Compare with expected progress",
        description: "Is the student ahead or behind schedule?",
        solutions: [
          { title: "Flight hours vs expected", effort: "M", impact: "M", source: "Airtable logboek", note: "Simplest proxy for v1" },
          { title: "Syllabus milestones comparison (v2)", effort: "H", impact: "H", source: "Eigen syllabus data", note: "More complex" }
        ]
      }
    ],
    mvp: [
      "Airtable: fetch all report cards per student",
      "AI summary: strong points, areas of attention, recent trend",
      "Requestable via chat: 'give me an overview of student X'",
      "Text summary — no graphs in v1"
    ],
    outOfScope: "Syllabus schedule comparison and visual graphs.",
    hypotheses: [
      { h: "Instructors want progress on request, not automatically before every lesson", test: "Observe: when do they request it?" },
      { h: "AI summary saves more than 5 minutes per evaluation", test: "Measure time with vs without in 3 real evaluations" }
    ]
  },
  {
    id: "logbook",
    label: "Logbook Calculator", role: "instructeur",
    votes: 2, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Instructor photographs the Hobbs meter and clock, Steward automatically reads the times and generates a correct logbook entry — without manual transcription or calculation",
      metric: "Zero calculation errors • Faster logbook maintenance • Fewer incorrect entries"
    },
    opportunities: [
      {
        id: 1, title: "Read Hobbs meter via photo",
        description: "Instructor manually transcribes Hobbs times — error-prone",
        solutions: [
          { title: "Photo upload in Steward chat", effort: "S", impact: "H", source: "Camera input mobile", note: "Photo before and after flight" },
          { title: "OCR via Gemini Vision", effort: "S", impact: "H", source: "Gemini multimodal", note: "Gemini reads Hobbs values directly from photo — no external OCR service needed" },
          { title: "Validation: calculate Hobbs delta", effort: "S", impact: "H", source: "Logic", note: "Hobbs after − before = flight time" }
        ]
      },
      {
        id: 2, title: "Read start/landing times",
        description: "Clock times are manually noted and transcribed",
        solutions: [
          { title: "Photo of clock at start and landing", effort: "S", impact: "H", source: "Camera input mobile", note: "Analog or digital — Gemini reads both" },
          { title: "OCR clock time via Gemini Vision", effort: "S", impact: "H", source: "Gemini multimodal", note: "Same flow as Hobbs" },
          { title: "Calculate block time", effort: "S", impact: "H", source: "Logic", note: "Start − landing = block time" }
        ]
      },
      {
        id: 3, title: "Generate logbook entry",
        description: "Calculating categories takes time and leads to errors",
        solutions: [
          { title: "Automatic EASA categorization", effort: "M", impact: "H", source: "Flight type logic", note: "Dual, solo PIC, instruction — based on lesson type" },
          { title: "Ready-made logbook row output", effort: "S", impact: "H", source: "Gemini + calculation", note: "Instructor copies directly to logbook" },
          { title: "Save to Airtable", effort: "M", impact: "M", source: "Airtable REST API", note: "Digital logbook backup" }
        ]
      }
    ],
    mvp: [
      "Photo Hobbs before flight → Gemini Vision reads value",
      "Photo Hobbs after flight → delta = flight time",
      "Photo of clock at start and landing → block time calculation",
      "EASA categories automatically based on lesson type",
      "Output: ready-made logbook row for instructor to copy",
      "Optional: save entry to Airtable as digital backup"
    ],
    outOfScope: "Automatic sync to official digital logbook — compliance too complex for v1.",
    hypotheses: [
      { h: "Gemini Vision recognizes Hobbs meter values reliably enough for production use", test: "Test with 20 photos of E-Flight's actual Hobbs meters — measure accuracy" },
      { h: "Errors mainly come from transcription, not from incorrect categorization", test: "Ask 3 instructors: where exactly does it go wrong in the logbook?" },
      { h: "Instructors want to save the entry digitally too, not just on paper", test: "Ask after 1 week of use: do you save the entries digitally or only the paper logbook?" }
    ]
  },
  {
    id: "instructor-feedback",
    label: "Student Feedback on Instructor", role: "student",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Students can anonymously rate their instructor after every lesson — instructors gain insight into how they come across",
      metric: "Better instructor-student relationship • Insight into teaching quality • Early detection of issues"
    },
    opportunities: [
      {
        id: 1, title: "Post-lesson rating system",
        description: "Students have no way to give feedback on instructors",
        solutions: [
          { title: "Post-lesson rating in Steward (1–5 stars)", effort: "S", impact: "H", source: "UI component + Airtable", note: "Automatically triggered after lesson — simple and quick" },
          { title: "Categories: explanation, patience, safety, preparation", effort: "S", impact: "H", source: "Own design", note: "Score per dimension — not just overall" },
          { title: "Optional open text", effort: "S", impact: "M", source: "UI textarea", note: "Student can add a comment" }
        ]
      },
      {
        id: 2, title: "Ensure anonymity",
        description: "Students won't give honest feedback if they fear consequences",
        solutions: [
          { title: "Store feedback fully anonymously", effort: "S", impact: "H", source: "Airtable without student ID", note: "Instructor sees scores — not who" },
          { title: "Minimum threshold for display (e.g. 3+ responses)", effort: "S", impact: "H", source: "Logic", note: "Prevents traceability in small groups" }
        ]
      },
      {
        id: 3, title: "Insight for instructor",
        description: "Instructor has no dashboard of received feedback",
        solutions: [
          { title: "Show own scores in Steward", effort: "S", impact: "H", source: "Airtable query + UI", note: "Average per category over time" },
          { title: "Trend over time", effort: "M", impact: "M", source: "Airtable + Gemini analysis", note: "Does score improve after training? Drop under high workload?" }
        ]
      }
    ],
    mvp: [
      "Post-lesson rating trigger in Steward for student",
      "4 categories: explanation, patience, safety, preparation — each 1–5 stars",
      "Store fully anonymously in Airtable",
      "Instructor sees own averages — only visible after minimum 3 responses"
    ],
    outOfScope: "Feedback visible to management or chief instructor — first build trust with instructors.",
    hypotheses: [
      { h: "Students give honest feedback when anonymity is guaranteed", test: "Ask 3 students: would you fill this in? What would stop you?" },
      { h: "Instructors are open to student feedback when it is anonymous", test: "Ask instructors first — buy-in is a prerequisite for adoption" },
      { h: "4 categories is the right granularity — not too many, not too few", test: "Show the categories to 2 students and 2 instructors — does this feel right?" }
    ]
  },
  {
    id: "lesson-prep",
    label: "Lesson Preparation (Student)", role: "student",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Student gets from Steward exactly the documents, theory, and information needed to prepare well for the upcoming lesson — without having to search themselves",
      metric: "Better prepared students • More effective lessons • Less time spent on 'what do I need to study?'"
    },
    opportunities: [
      {
        id: 1, title: "Fetch upcoming lesson for student",
        description: "Student doesn't always know exactly what will be covered in the lesson",
        solutions: [
          { title: "Airtable: next lesson for this student", effort: "S", impact: "H", source: "Airtable REST API", note: "Lesson type, exercises, expected duration" },
          { title: "Steward shows lesson overview on request", effort: "S", impact: "H", source: "Chat interface", note: "'What's on the agenda for the next lesson?'" }
        ]
      },
      {
        id: 2, title: "Point to relevant documents",
        description: "Student searches handbooks themselves — doesn't know what's relevant",
        solutions: [
          { title: "Show POH sections per exercise", effort: "M", impact: "H", source: "Google Drive / On-Demand Knowledge", note: "E.g. stall exercise → stall speed table POH" },
          { title: "Theory chapters per lesson", effort: "M", impact: "H", source: "Notion or Google Drive", note: "ATPL/PPL theory linked to practical lesson" },
          { title: "Directly link E-Flight lesson materials", effort: "S", impact: "H", source: "Notion knowledge base", note: "Internal docs, checklists, procedures" }
        ]
      },
      {
        id: 3, title: "Preparation checklist for student",
        description: "Student doesn't know if they are sufficiently prepared",
        solutions: [
          { title: "AI generates 3–5 preparation questions per lesson", effort: "S", impact: "H", source: "Gemini + syllabus", note: "Student can test themselves before the lesson" },
          { title: "Checklist: what do you need to know/be able to do for this lesson?", effort: "S", impact: "M", source: "Notion exercise database", note: "Concrete and actionable" }
        ]
      }
    ],
    mvp: [
      "Student asks via chat: 'what should I prepare for?'",
      "Steward shows: lesson type + planned exercises from Airtable",
      "Relevant POH sections and theory chapters linked",
      "3–5 self-test questions to help student check if they're ready"
    ],
    outOfScope: "Automatic push notification to student before the lesson — first validate that students actively request it.",
    hypotheses: [
      { h: "Students currently don't know well enough what to prepare", test: "Ask 3 students: how do you prepare for a lesson? What's missing?" },
      { h: "Self-test questions are more valuable than a list of documents", test: "Test both with 2 students — which do they use more?" },
      { h: "Students use this actively when stuck, not as a daily tool", test: "Measure when and how often it's requested after launch" }
    ]
  },
  {
    id: "comment-standardization",
    label: "Comment Standardization", role: "instructeur",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Instructors get insight into how their report card comments differ from colleagues, and Steward helps work toward a shared writing style and vocabulary",
      metric: "More consistent feedback for students • Better comparability between instructors • Higher quality report cards"
    },
    opportunities: [
      {
        id: 1, title: "Comment style analysis per instructor",
        description: "Instructors don't know how their writing style compares to colleagues",
        solutions: [
          { title: "Airtable: fetch all comments per instructor", effort: "M", impact: "H", source: "Airtable REST API", note: "Grouped by instructor ID" },
          { title: "AI style analysis: length, specificity, tone, vocabulary", effort: "S", impact: "H", source: "Gemini", note: "Do you write short/long? Vague/specific? Positive/critical?" },
          { title: "Comparison with anonymous averages", effort: "S", impact: "H", source: "Gemini aggregation", note: "Other instructors anonymized — privacy-aware" }
        ]
      },
      {
        id: 2, title: "Pattern recognition in comments",
        description: "Inconsistent terminology makes comments difficult to compare over time",
        solutions: [
          { title: "AI: which terms do you use vs colleagues?", effort: "S", impact: "M", source: "Gemini", note: "E.g. you say 'sloppy' — colleague says 'not precise enough'" },
          { title: "Signal missing categories", effort: "S", impact: "M", source: "Gemini", note: "Do you never write about airmanship? Other instructors do." }
        ]
      },
      {
        id: 3, title: "Standard comment vocabulary",
        description: "No shared framework for what good feedback looks like",
        solutions: [
          { title: "E-Flight comment guidelines in Notion", effort: "M", impact: "H", source: "Notion", note: "What do we expect from a good comment per category?" },
          { title: "AI suggestion while writing comment", effort: "M", impact: "H", source: "Gemini inline suggestion", note: "While instructor types: 'Would you like to phrase this more specifically?'" },
          { title: "Comment template per exercise", effort: "M", impact: "M", source: "Notion + Gemini", note: "Structure: what went well / what can improve / focus next lesson" }
        ]
      }
    ],
    mvp: [
      "Airtable: fetch all report card comments per instructor",
      "AI analysis: your writing style vs anonymized average",
      "Insight: length, specificity, used categories",
      "Report: 'you rarely write about X — other instructors often do'"
    ],
    outOfScope: "Real-time suggestions while typing (v2) — first give insight, then guide.",
    hypotheses: [
      { h: "Instructors are surprised by how their style differs from colleagues", test: "Show the analysis to 2 instructors — is it recognizable or surprising?" },
      { h: "Anonymization is essential for adoption — instructors don't want to be judged", test: "Ask explicitly: do you want to know who writes what, or would you prefer anonymous?" },
      { h: "Insight alone is not enough — instructors also want concrete suggestions", test: "Observe after 1 week: does anyone change their writing style without a nudge?" }
    ]
  },
  {
    id: "pulse",
    label: "Background Pulse", role: "systeem",
    votes: null, priority: 2, status: "Technical", statusColor: "#8b5cf6",
    outcome: {
      title: "The chat interface shows a subtle background animation while the AI is thinking — user immediately sees something is happening without watching a spinner",
      metric: "Better perceived performance • Fewer 'is it still working?' moments"
    },
    opportunities: [
      {
        id: 1, title: "Visual thinking indicator",
        description: "User currently only sees a static cursor or spinner while loading",
        solutions: [
          { title: "CSS pulse animation on chat background", effort: "S", impact: "M", source: "CSS keyframes", note: "Subtle glow that pulses while Gemini streams" },
          { title: "Gradient shift across the screen", effort: "S", impact: "M", source: "CSS animation", note: "Soft color transition — not distracting" },
          { title: "Show streaming text directly", effort: "S", impact: "H", source: "Gemini streaming API", note: "Word by word appearance = best perceived performance" }
        ]
      }
    ],
    mvp: [
      "CSS pulse or gradient animation on background during Gemini API call",
      "Stops when response is complete",
      "Combined with streaming text output for best effect"
    ],
    outOfScope: "Complex lottie animations or loading skeletons — keep it subtle.",
    hypotheses: [
      { h: "Streaming text has more impact on perceived performance than a background animation", test: "Test both with 3 users — which feels faster?" }
    ]
  },
  {
    id: "toon",
    label: "TOON Optimization", role: "systeem",
    votes: null, priority: 0, status: "Done ✓", statusColor: "#22c55e",
    outcome: {
      title: "Airtable data is sent as TOON instead of JSON to Gemini, reducing each API call by 30–50% in tokens",
      metric: "Lower API costs • Faster responses • More data per context window"
    },
    opportunities: [
      {
        id: 1, title: "JSON → TOON conversion in API pipeline",
        description: "Airtable responses arrive as verbose JSON — every field repeats the key",
        solutions: [
          { title: "TOON converter in Next.js API route", effort: "S", impact: "H", source: "toon-py / toon npm package", note: "Convert Airtable JSON to TOON before Gemini call" },
          { title: "Generic helper function", effort: "S", impact: "H", source: "Own implementation", note: "Lightweight — TOON syntax is simple enough to write yourself" }
        ]
      },
      {
        id: 2, title: "Apply to structured data",
        description: "Not all data benefits equally from TOON",
        solutions: [
          { title: "Gradesheets and remarks (high benefit)", effort: "S", impact: "H", source: "Repetitive table data", note: "Many rows, fixed columns — maximum token savings" },
          { title: "Flight planning and lesson overviews", effort: "S", impact: "H", source: "Airtable tables", note: "Same pattern" },
          { title: "Free text remarks (low benefit)", effort: "S", impact: "S", source: "N/A", note: "Plain text barely benefits — don't apply" }
        ]
      },
      {
        id: 3, title: "Validation: Gemini interprets TOON correctly",
        description: "TOON is new — verify that Gemini interprets the structure correctly",
        solutions: [
          { title: "A/B test: JSON vs TOON response quality", effort: "S", impact: "H", source: "Existing prompts", note: "Same data, both formats — compare output quality" },
          { title: "Fallback to JSON on parsing errors", effort: "S", impact: "M", source: "Error handling", note: "Safety net for production" }
        ]
      }
    ],
    mvp: [
      "Helper function: Airtable JSON → TOON conversion",
      "Apply to gradesheets and flight data",
      "A/B test: same prompt with JSON vs TOON — compare token count and output",
      "Fallback to JSON if Gemini response deviates"
    ],
    outOfScope: "Applying TOON to free text or PDF content — no significant benefit.",
    hypotheses: [
      { h: "Gemini interprets TOON as accurately as JSON for structured flight data", test: "Send the same gradesheet as JSON and as TOON — compare the AI output" },
      { h: "The token savings are significant enough to justify the conversion overhead", test: "Measure tokens before/after on a real Airtable response of 10 gradesheets" }
    ]
  },
  {
    id: "student-guidance",
    label: "Student Study Guidance", role: "student",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Student gets from Steward a clear overview of everything that needs to happen outside practical lessons — theory, exams, medicals, administration — and is guided step by step through the training pathway",
      metric: "Less confusion about what needs to happen when • Students arrange things on time • Fewer questions to instructors about administration"
    },
    opportunities: [
      {
        id: 1, title: "Explain training roadmap",
        description: "Student has no overview of everything that needs to happen outside flights",
        solutions: [
          { title: "Roadmap explanation via chat", effort: "S", impact: "H", source: "Notion knowledge base E-Flight", note: "PPL path: theory → exams → medical → practical → checkride" },
          { title: "Personalized to progress", effort: "M", impact: "H", source: "Airtable student status", note: "What have you already done? What's still to do?" },
          { title: "Explanation on request", effort: "S", impact: "H", source: "Gemini + Notion", note: "'What is an RT exam?' → Steward explains" }
        ]
      },
      {
        id: 2, title: "Theory guidance",
        description: "Student doesn't know how to combine theory with practical progress",
        solutions: [
          { title: "Explain theory subjects + advise on order", effort: "S", impact: "H", source: "Gemini + EASA syllabus", note: "Which subjects, in what order, how long does it take?" },
          { title: "Link theory to practical lesson", effort: "M", impact: "H", source: "Notion + Airtable", note: "Flying circuits? Then you need to know airspace classes" },
          { title: "RT exam preparation", effort: "S", impact: "M", source: "Gemini + RT study material", note: "What is RT, how does the exam work, how do you practice?" }
        ]
      },
      {
        id: 3, title: "Medicals and administration",
        description: "Student doesn't know when what needs to be arranged",
        solutions: [
          { title: "Class 2 medical explanation + planning", effort: "S", impact: "H", source: "Gemini + EASA regulations", note: "Where to apply, how far in advance, costs" },
          { title: "Administrative checklist per phase", effort: "S", impact: "M", source: "Notion", note: "What to arrange before first solo, before checkride, etc." }
        ]
      },
      {
        id: 4, title: "Answer questions about the training",
        description: "Student asks administrative questions to instructors — costs instructor time",
        solutions: [
          { title: "FAQ via existing Virtual Ops chat", effort: "S", impact: "H", source: "Notion FAQ + Gemini", note: "Costs, duration, procedures, requirements — partly available already" },
          { title: "Escalation when Steward doesn't know", effort: "S", impact: "M", source: "Chat interface", note: "'I'm not sure about this — ask your instructor'" }
        ]
      }
    ],
    mvp: [
      "Chat-based explanation of the PPL training pathway on request",
      "Theory subjects: what are they, what order, how long",
      "RT exam: what is it and how do you prepare",
      "Class 2 medical: where, when, how to apply",
      "Personalized: what have you already done based on Airtable status"
    ],
    outOfScope: "Full theory tutoring or practice exams — this is orientation and guidance, not a learning platform.",
    hypotheses: [
      { h: "Students currently ask many administrative questions to instructors that Steward can answer", test: "Ask 2 instructors: what questions do you get most from students outside of flights?" },
      { h: "A roadmap overview reduces anxiety and confusion in new students", test: "Show roadmap to 2 new students — what was unclear to them?" },
      { h: "Students use this actively when stuck, not as a daily tool", test: "Measure when and how often it's requested after launch" }
    ]
  },
  {
    id: "license-medical-check",
    label: "License & Medical Check", role: "instructeur",
    votes: 2, priority: 1, status: "Priority", statusColor: "#22c55e",
    outcome: {
      title: "Instructor can instantly see whether a student's license and medical are valid — without opening Airtable themselves",
      metric: "No flights with expired documents • Compliance ensured • Seconds instead of minutes to verify"
    },
    opportunities: [
      {
        id: 1, title: "Medical validity check",
        description: "Instructor has to manually check medical expiry dates before each lesson",
        solutions: [
          { title: "Airtable: medical expiry date per student", effort: "S", impact: "H", source: "Airtable expiry dates", note: "Red if expired, orange if within 30 days, green if valid" },
          { title: "Warning in Lesson Briefing when medical expires soon", effort: "S", impact: "H", source: "Lesson Briefing feature", note: "Automatically surfaced — no manual check needed" }
        ]
      },
      {
        id: 2, title: "License validity and progress check",
        description: "PPL license status and training progress are not checked systematically before lessons",
        solutions: [
          { title: "PPL progress check against required exercises", effort: "M", impact: "H", source: "Airtable gradesheets", note: "Have required exercises been sufficiently scored?" },
          { title: "Student license type and restrictions visible", effort: "S", impact: "M", source: "Airtable student profile", note: "Student pilot license, restrictions, ratings" }
        ]
      }
    ],
    mvp: [
      "Airtable: medical expiry date per student",
      "Red / orange / green status indicator",
      "Surfaced automatically in Lesson Briefing",
      "On-demand via chat: 'is [student]'s medical valid?'"
    ],
    outOfScope: "Solo endorsement, agreements, pre-solo checklist — those are in the Solo Check feature.",
    hypotheses: [
      { h: "Instructors don't always check medical expiry before a lesson — it gets missed", test: "Ask 2 instructors: how do you currently check this? How often do you forget?" },
      { h: "30-day warning is the right threshold — not too early, not too late", test: "Ask 2 instructors: when would you want to be notified about an expiring medical?" }
    ]
  },
  {
    id: "solo-check",
    label: "Solo Check", role: "instructeur",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Instructor sees at a glance whether a student is fully cleared for solo — endorsement present, agreements signed, medical valid — without searching Airtable themselves",
      metric: "No solo without complete file • All requirements visible in one place • Reduces risk of oversight"
    },
    opportunities: [
      {
        id: 1, title: "Solo endorsement and agreements",
        description: "Solo permission form and emergency procedures acknowledgement must be present and signed",
        solutions: [
          { title: "Solo endorsement boolean per student", effort: "S", impact: "H", source: "Airtable boolean per student", note: "Has instructor given endorsement?" },
          { title: "Tracking agreements in Airtable: signed on date", effort: "M", impact: "H", source: "Airtable checkbox + date", note: "Solo permission form + emergency procedures acknowledgement" },
          { title: "Document upload as proof", effort: "M", impact: "M", source: "Airtable attachment", note: "Scan of signed form" }
        ]
      },
      {
        id: 2, title: "Pre-solo checklist in Steward",
        description: "Instructor has no combined overview of all solo requirements in one place",
        solutions: [
          { title: "Solo readiness card per student", effort: "S", impact: "H", source: "Airtable query + UI", note: "All checks in one screen: green = ready, red = action required" },
          { title: "Auto-trigger in Lesson Briefing when lesson type = solo", effort: "S", impact: "H", source: "Lesson Briefing feature", note: "Checklist appears automatically — instructor doesn't have to remember to check" },
          { title: "Steward shows exactly what is missing", effort: "S", impact: "H", source: "Airtable query", note: "Clear ✓/✗ per item with action suggestion" }
        ]
      }
    ],
    mvp: [
      "Pre-solo checklist: medical ✓/✗ | endorsement ✓/✗ | solo permission form ✓/✗ | emergency procedures ✓/✗",
      "Auto-shown in Lesson Briefing when lesson type = solo",
      "Red/green per item — instructor immediately sees what's missing",
      "Builds on License & Medical Check for the medical item"
    ],
    outOfScope: "Automatically blocking the lesson, student notifications — instructor remains responsible for the decision.",
    hypotheses: [
      { h: "Instructors sometimes forget a check before solo because requirements are scattered", test: "Ask: have you ever let a solo happen when something wasn't fully in order?" },
      { h: "The checklist is complete with these 4 items", test: "Have 2 instructors review the list: is anything missing?" },
      { h: "Auto-trigger in Lesson Briefing works better than a separate flow", test: "Show both variants — which feels more natural?" }
    ]
  },
  {
    id: "cancellation",
    label: "Cancellation Assistant", role: "instructeur",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Instructor can quickly decide to cancel a lesson and efficiently notify students",
      metric: "Time savings on cancellation • Less missed communication"
    },
    opportunities: [
      {
        id: 1, title: "Weather go/no-go insight",
        description: "No flight-specific weather overview available",
        solutions: [
          { title: "KNMI API integration", effort: "M", impact: "H", source: "KNMI open data", note: "Wind, visibility, cloud base EHTE" },
          { title: "Go/No-Go indicator", effort: "S", impact: "H", source: "Threshold logic", note: "Green/orange/red per flight" }
        ]
      },
      {
        id: 2, title: "Contact prioritization students",
        description: "Instructor has to figure out themselves who to call",
        solutions: [
          { title: "Airtable: upcoming flights + contacts", effort: "M", impact: "H", source: "Airtable REST API", note: "Today/tomorrow" },
          { title: "Call order by travel time", effort: "M", impact: "M", source: "Google Maps / OSRM", note: "Longest travel time = call first" }
        ]
      },
      {
        id: 3, title: "Communication",
        description: "Sending messages takes time",
        solutions: [
          { title: "Draft WhatsApp message", effort: "S", impact: "M", source: "Steward template", note: "Instructor sends themselves" }
        ]
      },
      {
        id: 4, title: "Offer alternative upon cancellation",
        description: "Upon cancellation there is no follow-up step — student goes home without an alternative",
        solutions: [
          { title: "Propose theory session", effort: "S", impact: "H", source: "Gemini + syllabus", note: "Based on where student is in the syllabus" },
          { title: "Check simulator availability", effort: "M", impact: "H", source: "Airtable simulator planning", note: "Is the sim available at the same time slot?" },
          { title: "Include alternative in cancellation message", effort: "S", impact: "M", source: "WhatsApp draft template", note: "'Flight is cancelled, but we can...'" }
        ]
      },
      {
        id: 5, title: "Bonus for instructor if student still comes",
        description: "No financial incentive to offer an alternative in bad weather — cancelling is easier",
        solutions: [
          { title: "Registration: alternative offered + student came", effort: "S", impact: "H", source: "Airtable", note: "Steward logs when alternative was proposed and whether student showed up" },
          { title: "Link to reward system", effort: "H", impact: "H", source: "External HR / salary system", note: "Out of scope v1 — first get registration working" },
          { title: "Instructor sees own score in Steward", effort: "M", impact: "M", source: "Airtable query + UI", note: "'You have offered X alternatives this quarter'" }
        ]
      }
    ],
    mvp: [
      "KNMI weather check + go/no-go for EHTE",
      "Upcoming flights + call order by travel time",
      "Suggest alternative: theory based on student's syllabus position",
      "Simulator check: available at the same time slot?",
      "Draft cancellation message including alternative proposal",
      "Registration in Airtable: alternative offered + student did/did not come"
    ],
    outOfScope: "Automatically sending via WhatsApp Business API. Link to financial reward system — first get registration working.",
    hypotheses: [
      { h: "Go/no-go indicator noticeably speeds up the decision", test: "Compare time with/without indicator" },
      { h: "Travel time is the right prioritization factor", test: "Validate with instructors" }
    ]
  },
  {
    id: "briefing",
    label: "Briefing Builder", role: "instructeur",
    votes: 1, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Steward generates a complete briefing based on teaching methodology, planned exercises, previous flight comments, POH/FTM, aircraft status, and weather — ready to use directly",
      metric: "More consistent briefings • Less prep time • All relevant info combined"
    },
    opportunities: [
      {
        id: 1, title: "Teaching methodology as briefing structure",
        description: "Briefings are not always pedagogically structured",
        solutions: [
          { title: "Teaching template per exercise", effort: "M", impact: "H", source: "Notion — E-Flight teaching methodology", note: "Learning objective → explanation → demonstration → exercise → evaluation" },
          { title: "AI adjusts depth to student level", effort: "S", impact: "H", source: "Gemini + student history", note: "Beginner vs advanced = different approach" }
        ]
      },
      {
        id: 2, title: "Process planned exercises",
        description: "Which exercises are planned and what does the instructor need to say about them?",
        solutions: [
          { title: "Airtable: exercises for this lesson", effort: "S", impact: "H", source: "Airtable lesson planning", note: "Linked to syllabus item" },
          { title: "Generate exercise-specific explanation", effort: "S", impact: "H", source: "Gemini + Notion exercise database", note: "Goal, explanation, common mistakes" }
        ]
      },
      {
        id: 3, title: "Include previous flight comments",
        description: "Briefing doesn't connect to what student did in previous lesson",
        solutions: [
          { title: "Fetch last gradesheet remarks", effort: "S", impact: "H", source: "Airtable + Lesson Briefing", note: "Builds on existing feature" },
          { title: "AI incorporates comments into briefing", effort: "S", impact: "H", source: "Gemini", note: "'Previous lesson difficulty with X — today focus on Y'" }
        ]
      },
      {
        id: 4, title: "POH / FTM integration",
        description: "Technical limits from the aircraft manual are not always at hand",
        solutions: [
          { title: "Relevant POH section based on exercise", effort: "M", impact: "H", source: "Google Drive / On-Demand Knowledge", note: "E.g. stall speeds for stall exercises" },
          { title: "Include FTM procedures in briefing", effort: "M", impact: "H", source: "Google Drive FTM", note: "Standard procedures per exercise" }
        ]
      },
      {
        id: 5, title: "Aircraft status + weather in briefing",
        description: "Current conditions are not included by default",
        solutions: [
          { title: "Aircraft remarks from Airtable", effort: "S", impact: "M", source: "Lesson Briefing feature", note: "Builds on existing feature" },
          { title: "KNMI weather summary", effort: "S", impact: "H", source: "Daily Briefing feature", note: "Wind, visibility, cloud base" },
          { title: "Name weather influence on exercise", effort: "S", impact: "H", source: "Gemini", note: "'15kt crosswind — watch for drift on circuits'" }
        ]
      }
    ],
    mvp: [
      "Fetch planned exercises from Airtable",
      "Include previous flight comments (from Lesson Briefing)",
      "Teaching structure: learning objective → explanation → points of attention per exercise",
      "Fetch relevant POH data based on exercise type",
      "Weather summary + impact on the exercise",
      "Include aircraft remarks",
      "Output: ready-made briefing text for instructor"
    ],
    outOfScope: "Interactive briefing with student (digital whiteboard etc.) — v1 is text output for instructor.",
    hypotheses: [
      { h: "POH integration is the most valuable addition over a plain template", test: "Ask instructors: what is currently missing most in your briefing preparation?" },
      { h: "Instructors want to adjust the output before use — pure AI text is not sufficient", test: "Have 2 instructors use the output in a real lesson — how much do they modify it?" },
      { h: "Briefing Builder is only usable once Lesson Briefing works", test: "Build Lesson Briefing first — then measure if adoption follows" }
    ]
  },
  {
    id: "knowledge-injection",
    label: "On-Demand Knowledge", role: "beide",
    votes: null, priority: 3, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "User can temporarily load large reference documents (EASA, briefing guidelines) for use in the chat",
      metric: "Fewer 'no answer' situations • Faster access to regulations"
    },
    opportunities: [
      {
        id: 1, title: "AI signals missing content",
        description: "User doesn't know why AI gives a vague answer",
        solutions: [
          { title: "Explicit notice in chat", effort: "S", impact: "H", source: "Gemini system prompt", note: "AI names what is missing" },
          { title: "Automatic document suggestion", effort: "M", impact: "H", source: "Keyword matching", note: "'Would you like to load EASA Part-FCL?'" }
        ]
      },
      {
        id: 2, title: "Load document",
        description: "No way to add extra context",
        solutions: [
          { title: "Preset document list", effort: "S", impact: "H", source: "Google Drive", note: "EASA Part-FCL, briefing guidelines" },
          { title: "Free upload (v2)", effort: "M", impact: "M", source: "Gemini Files API", note: "Out of scope v1" }
        ]
      },
      {
        id: 3, title: "Keep context active",
        description: "Context is lost between prompts",
        solutions: [
          { title: "Document in Gemini context window", effort: "S", impact: "H", source: "Gemini 1M tokens", note: "Active until end of session" },
          { title: "Active docs badge in UI", effort: "S", impact: "M", source: "UI", note: "Visible what has been loaded" }
        ]
      }
    ],
    mvp: [
      "AI explicitly signals when content is missing",
      "Preset list: EASA Part-FCL, briefing guidelines",
      "Button to load document",
      "Badge shows active document"
    ],
    outOfScope: "Free upload, URL input, permanent storage.",
    hypotheses: [
      { h: "Preset list covers 80% of the need", test: "Log which questions receive no answer" },
      { h: "Button is only used after explicit AI notice", test: "Observe adoption" }
    ]
  },
  {
    id: "confidence-display",
    label: "Confidence Display", role: "beide",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Steward indicates how certain it is of an answer, so instructors and students know when to verify it and when to trust it",
      metric: "Less blind trust in wrong answers • Less over-checking of correct answers • User knows when Steward is uncertain"
    },
    opportunities: [
      {
        id: 1, title: "Signal certainty per answer",
        description: "Steward currently gives answers without indicating how certain it is — user has no way to assess this",
        solutions: [
          { title: "Categorical indicator: certain / likely / uncertain", effort: "S", impact: "H", source: "Response metadata + prompt engineering", note: "Based on source type: Airtable = certain, Notion FAQ = likely, Gemini reasoning = uncertain" },
          { title: "Inline explanation for low certainty", effort: "S", impact: "H", source: "Prompt engineering", note: "'I'm not certain about this — check with your instructor'" },
          { title: "Visual difference between source types", effort: "M", impact: "M", source: "UI", note: "Airtable data badge vs. FAQ badge vs. AI reasoning badge" }
        ]
      },
      {
        id: 2, title: "Recognize high-stakes questions",
        description: "For questions about solo approval, medicals, or safety a wrong answer is dangerous — this requires extra caution",
        solutions: [
          { title: "Automatic detection of high-stakes topics", effort: "M", impact: "H", source: "Prompt engineering", note: "Keywords: solo, medical, authorized, valid, am I allowed — trigger extra disclaimer" },
          { title: "Fixed disclaimer for high-stakes answer", effort: "S", impact: "H", source: "System prompt", note: "'This is a safety-critical decision — always verify with your instructor'" }
        ]
      }
    ],
    mvp: [
      "Three levels: Certain (Airtable/verified source) / Likely (Notion FAQ) / Uncertain (AI reasoning)",
      "Inline text notice for uncertain answers",
      "Fixed disclaimer for high-stakes topics (solo, medical, authorization)"
    ],
    outOfScope: "Numerical percentages or statistical confidence scores — too technical for these users.",
    hypotheses: [
      { h: "Users trust Airtable-based answers more than FAQ answers when they see the difference", test: "Show the same answer with and without source label to 3 users — ask how certain they feel" },
      { h: "The disclaimer for high-stakes questions does not cause irritation but increases trust", test: "Test with 2 instructors — does it feel annoying or useful?" }
    ]
  },
  {
    id: "data-source-transparency",
    label: "Data Source Transparency", role: "beide",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Steward explains what data an answer or recommendation is based on, so users know what Steward knows — and what it doesn't",
      metric: "Less confusion about the origin of answers • User recognizes when data is incomplete • More trust in recommendations"
    },
    opportunities: [
      {
        id: 1, title: "Source attribution for answers",
        description: "Steward gives recommendations without saying what they're based on — user doesn't know if it comes from a gradesheet, FAQ, or Gemini's own reasoning",
        solutions: [
          { title: "Source label per answer: 'Based on [source]'", effort: "S", impact: "H", source: "Response metadata", note: "E.g. 'Based on 8 gradesheets from Jana' or 'Based on E-Flight FAQ'" },
          { title: "Explanation of what data Steward has about the student", effort: "M", impact: "M", source: "Airtable query + explanation", note: "'I see gradesheets from the past 3 months, but no data about your medical'" }
        ]
      },
      {
        id: 2, title: "Signal missing data",
        description: "When Steward makes a recommendation based on incomplete data, the user doesn't know this",
        solutions: [
          { title: "Explicit notice when data is missing", effort: "S", impact: "H", source: "Prompt engineering", note: "'I have no recent flight data for this student — my summary is based on older data'" },
          { title: "Indicate which data sources are active in the conversation", effort: "M", impact: "M", source: "UI badge / context indicator", note: "Visible which sources Steward has loaded: Airtable ✓, Notion ✓, Drive ✓" }
        ]
      }
    ],
    mvp: [
      "Source label for every recommendation: which data source was used",
      "Notice when relevant data is missing or incomplete",
      "No technical details — user-friendly description of the source"
    ],
    outOfScope: "Full data audit trail or GDPR overview — that is a separate compliance issue.",
    hypotheses: [
      { h: "Instructors want to know how many gradesheets an AI summary is based on", test: "Ask 2 instructors: does it matter to you whether a summary is based on 3 or 10 flights?" },
      { h: "Students find it reassuring when Steward indicates what it doesn't know", test: "Test the message 'I have no data about X' — does that feel honest or incompetent?" }
    ]
  },
  {
    id: "escalation-guardrails",
    label: "High-Stakes Escalation", role: "beide",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Steward recognizes questions where a wrong answer has dangerous or irreversible consequences, and actively directs users to a human",
      metric: "No incorrect solo approvals based on Steward • No missed medicals • Instructor remains responsible for critical decisions"
    },
    opportunities: [
      {
        id: 1, title: "Define high-stakes categories",
        description: "Not all questions are equally critical — but some have direct safety consequences if Steward answers them wrong",
        solutions: [
          { title: "Fixed list of high-stakes topics in system prompt", effort: "S", impact: "H", source: "System prompt", note: "Solo approval, medical validity, authorizations, emergency procedures, technical aircraft defects" },
          { title: "Automatic detection based on keywords + intent", effort: "M", impact: "H", source: "Prompt engineering", note: "Steward recognizes the intent, not just the keyword" }
        ]
      },
      {
        id: 2, title: "Escalation behavior per category",
        description: "Steward must respond differently depending on severity — sometimes warn, sometimes fully redirect",
        solutions: [
          { title: "Answer + disclaimer (medium stakes)", effort: "S", impact: "H", source: "Prompt engineering", note: "'Here is the answer, but always verify this with your instructor'" },
          { title: "Redirect without answering (high stakes)", effort: "S", impact: "H", source: "System prompt", note: "For emergency procedures or solo approval: no answer, direct referral to instructor" },
          { title: "Instructor notification for critical question (v2)", effort: "H", impact: "M", source: "Make.com + notification system", note: "When student asks 'can I fly solo yet?' → instructor gets notification" }
        ]
      }
    ],
    mvp: [
      "Fixed list of high-stakes categories in system prompt",
      "Medium stakes: answer + mandatory disclaimer",
      "High stakes (solo, emergency procedures): redirect without giving an answer"
    ],
    outOfScope: "Automatic instructor notifications — v2 after validation of the categories.",
    hypotheses: [
      { h: "Instructors are reassured when Steward always redirects solo questions to them", test: "Show scenario to 2 instructors: Steward answers solo question vs. redirects — which preference?" },
      { h: "The boundary between 'answer + disclaimer' and 'do not answer' is difficult to define — iteration needed", test: "Make a shortlist of 10 example questions, have 2 instructors categorize them" }
    ]
  },
  {
    id: "onboarding-expectations",
    label: "Onboarding & Expectations", role: "beide",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "New users understand from the first use what Steward can and cannot do, what data it uses, and how to use it best — so they neither over- nor under-trust it",
      metric: "Less disappointment at first use • Better questions to Steward • Fewer 'Steward doesn't work' feelings at edge cases"
    },
    opportunities: [
      {
        id: 1, title: "Set expectations at first interaction",
        description: "Users open Steward without knowing what it can do — the first disappointment determines long-term trust",
        solutions: [
          { title: "Welcome message with capabilities and limitations", effort: "S", impact: "H", source: "System prompt + UI", note: "What I can do: fetch gradesheets, explain planning, answer FAQs. What I cannot do: make final decisions, provide real-time data." },
          { title: "Guided conversation starters as implicit onboarding", effort: "S", impact: "M", source: "Existing flow system (Edge Config)", note: "The conversation options show what Steward can do — without having to explain" }
        ]
      },
      {
        id: 2, title: "Explain what data Steward has",
        description: "User doesn't know what data Steward can see — this leads to wrong expectations",
        solutions: [
          { title: "Data overview requestable via chat", effort: "S", impact: "M", source: "System prompt", note: "'What do you know about me?' → Steward gives overview of available data sources for that user" },
          { title: "Explanation per role at first login", effort: "M", impact: "M", source: "UI + role detection", note: "Instructor sees different capabilities than student" }
        ]
      },
      {
        id: 3, title: "Proactively communicate limitations",
        description: "PAIR: tell users when the system performs less well, not only when it works well",
        solutions: [
          { title: "Steward names its own limitations in context", effort: "S", impact: "H", source: "Prompt engineering", note: "'I cannot retrieve real-time NOTAM data' for briefing questions" },
          { title: "'What can Steward not do' page or FAQ item", effort: "S", impact: "M", source: "Notion FAQ", note: "Manageable via existing FAQ system" }
        ]
      }
    ],
    mvp: [
      "Welcome message at first chat: what I can do, what I cannot do",
      "On request: 'what do you know about me?' gives data source overview",
      "Proactive limitation notice in context (e.g. no real-time data)"
    ],
    outOfScope: "Interactive onboarding tour or video explanation — text in chat is sufficient for v1.",
    hypotheses: [
      { h: "Users don't read the welcome message — the conversation starters are more effective onboarding", test: "Observe whether users skip or read the welcome message at first use" },
      { h: "The question 'what do you know about me?' is asked by new users who want to understand what Steward sees", test: "Log how often this question occurs after launch" }
    ]
  },
  {
    id: "voice-output",
    label: "Voice Output", role: "beide",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "Steward reads its responses aloud — users can listen to answers hands-free, especially useful in the hangar, on the apron, or during pre-flight prep when looking at a screen isn't practical",
      metric: "Usable hands-free • Faster information intake during busy moments • Better fit for kiosk/hangar context"
    },
    opportunities: [
      {
        id: 1, title: "Text-to-speech for Steward responses",
        description: "All Steward answers are currently text-only — not usable when hands or eyes are occupied",
        solutions: [
          { title: "Web Speech API (browser-native TTS)", effort: "S", impact: "H", source: "Web Speech API", note: "Zero cost, works offline, no external service needed — quality varies by browser/OS" },
          { title: "Google Cloud Text-to-Speech", effort: "M", impact: "H", source: "Google Cloud TTS API", note: "Higher quality voices, multilingual (NL/EN/DE), natural prosody — small cost per character" },
          { title: "Gemini native audio output (future)", effort: "M", impact: "H", source: "Gemini Live API", note: "End-to-end voice — Gemini speaks directly without separate TTS step" }
        ]
      },
      {
        id: 2, title: "Voice controls",
        description: "User needs control over playback without touching the screen",
        solutions: [
          { title: "Play / pause / stop button per response", effort: "S", impact: "H", source: "UI + Web Speech API", note: "Basic controls alongside the text response" },
          { title: "Auto-play toggle (on/off)", effort: "S", impact: "H", source: "UI + cookie/localStorage", note: "User sets preference once — saved between sessions" },
          { title: "Speed control (0.75x – 1.5x)", effort: "S", impact: "M", source: "Web Speech API rate property", note: "Useful for fast readers or dense technical content" }
        ]
      },
      {
        id: 3, title: "Voice language matches interface language",
        description: "Steward operates in NL/EN/DE — voice must match the response language",
        solutions: [
          { title: "Auto-detect language per response", effort: "S", impact: "H", source: "Gemini response metadata", note: "Use the language Steward replied in to select the correct voice" },
          { title: "Manual language override in settings", effort: "S", impact: "M", source: "UI setting", note: "User can force a specific voice language" }
        ]
      },
      {
        id: 4, title: "Kiosk / hangar context",
        description: "In the hangar or on the apron, voice output is more practical than reading a screen",
        solutions: [
          { title: "Always-on speaker mode for kiosk deployment", effort: "S", impact: "H", source: "UI setting + Web Speech API", note: "Auto-play enabled by default on kiosk — optimized for touchscreen + voice combo" },
          { title: "Strip markdown before speaking", effort: "S", impact: "H", source: "Text preprocessing", note: "Remove bullet points, headers, asterisks before TTS — avoids 'asterisk asterisk bold asterisk asterisk'" }
        ]
      }
    ],
    mvp: [
      "Web Speech API TTS — no cost, no external dependency",
      "Play button per Steward response",
      "Auto-play toggle saved in cookie",
      "Strip markdown/formatting before speaking",
      "Auto-detect language from response (NL/EN/DE)"
    ],
    outOfScope: "Voice input (speech-to-text) — that's a separate feature. Google Cloud TTS or Gemini Live for higher quality voices — v2 after validating that users actually use it.",
    hypotheses: [
      { h: "Voice output is primarily useful in the hangar/kiosk context, not at a desk", test: "Ask 3 instructors: in which situations would you actually listen instead of read?" },
      { h: "Web Speech API quality is good enough — users won't demand a premium voice", test: "Play a Web Speech API sample to 2 instructors — acceptable or not?" },
      { h: "Auto-play is too disruptive in shared spaces — users prefer manual play", test: "Observe first week: do users turn off auto-play immediately?" }
    ]
  },
  {
    id: "faq-images",
    label: "Images in FAQ Answers", role: "beide",
    votes: null, priority: 0, status: "Done ✓", statusColor: "#22c55e",
    outcome: {
      title: "FAQ answers can include images — diagrams, charts, checklists, airport layouts — stored in Notion and displayed inline in the Steward chat response",
      metric: "Clearer answers for visual topics • Less back-and-forth on procedural questions • Better fit for kiosk/touchscreen context"
    },
    opportunities: [
      {
        id: 1, title: "Image storage in Notion",
        description: "Notion FAQ answers are currently text-only — no way to attach or reference images",
        solutions: [
          { title: "Inline images in Notion page body", effort: "S", impact: "H", source: "Notion API", note: "Notion supports image blocks natively — Notion API returns public URLs for attached images" },
          { title: "Dedicated image field per FAQ entry", effort: "S", impact: "M", source: "Notion database property", note: "Files & Media property type — one or more images per FAQ" },
          { title: "Google Drive as image host, linked from Notion", effort: "M", impact: "M", source: "Google Drive + Notion", note: "More control over access, but adds sync complexity" }
        ]
      },
      {
        id: 2, title: "Fetch and pass images to chat",
        description: "Steward API pipeline currently only passes text — images from Notion are ignored",
        solutions: [
          { title: "Extract image URLs from Notion API response", effort: "S", impact: "H", source: "Notion API + Next.js", note: "Image blocks return a URL — pass alongside the answer text" },
          { title: "Include image URLs in Steward response payload", effort: "S", impact: "H", source: "API response schema", note: "Extend response to include { text, images: [] } instead of text only" }
        ]
      },
      {
        id: 3, title: "Display images inline in chat",
        description: "Chat UI currently renders text only — no image rendering",
        solutions: [
          { title: "Render images below the answer text", effort: "S", impact: "H", source: "React + img tag", note: "Simple and clear — image appears after the text answer" },
          { title: "Lightbox on tap/click for larger view", effort: "S", impact: "M", source: "CSS / simple modal", note: "Especially useful on kiosk touchscreen" },
          { title: "Caption from Notion image alt text", effort: "S", impact: "M", source: "Notion API", note: "Notion image blocks support captions — use as figure label" }
        ]
      },
      {
        id: 4, title: "Content management for non-technical team",
        description: "Instructors and ops team need to be able to add/update images without a developer",
        solutions: [
          { title: "Upload images directly in Notion FAQ entry", effort: "S", impact: "H", source: "Notion UI", note: "Drag & drop in Notion — no technical knowledge required" },
          { title: "Make.com sync picks up image changes automatically", effort: "M", impact: "H", source: "Make.com webhook", note: "Extend existing sync to also detect image block changes" }
        ]
      }
    ],
    mvp: [
      "Add image blocks to Notion FAQ entries (drag & drop in Notion — no dev work for content team)",
      "Extract image URLs from Notion API response in sync pipeline",
      "Pass image URLs alongside answer text in Steward API response",
      "Render images inline below answer text in chat UI",
      "Lightbox on tap for full-size view"
    ],
    outOfScope: "AI-generated images, Google Drive as primary image host, image search across Drive docs — Notion inline images cover the FAQ use case cleanly.",
    hypotheses: [
      { h: "Images add most value for procedural FAQs (checklists, airport layouts, diagrams) — not for simple text answers", test: "List current FAQs with instructors: which 5 would benefit most from an image?" },
      { h: "Notion image URLs expire or become inaccessible — this needs testing before production use", test: "Upload a test image to Notion, fetch URL via API, check if it stays accessible after 24h / 7 days" },
      { h: "Content team will actually add images if it is just drag and drop in Notion", test: "Show 1 non-technical team member how to add an image — do they do it without help?" }
    ]
  },
  {
    id: "mcp-data-layer",
    label: "MCP Data Layer", role: "systeem",
    votes: null, priority: 2, status: "Backlog", statusColor: "#f59e0b",
    outcome: {
      title: "All E-Flight data sources (Wings, Notion, Airtable, Shopify, Drive) are accessible via a single MCP server — so Steward and future apps share one data layer instead of each re-implementing API integrations",
      metric: "One integration per data source • New apps connect in hours, not days • Consistent caching and auth across all consumers"
    },
    opportunities: [
      {
        id: 1, title: "Duplicated API integrations across apps",
        description: "Every new app that needs Wings or Airtable data has to re-implement the same API calls, auth, caching, and error handling",
        solutions: [
          { title: "MCP server with tools per data domain", effort: "H", impact: "H", source: "MCP SDK (TypeScript)", note: "Tools like getInstructorSchedule, getStudentProfile, getFaqs — each wraps an existing lib function" },
          { title: "Extract existing Steward lib/ functions into shared packages", effort: "M", impact: "H", source: "Steward codebase", note: "wings.ts, faq.ts, role-access.ts already exist — wrap them as MCP tools" },
          { title: "Standalone MCP server repo (separate from Steward)", effort: "M", impact: "H", source: "New repo", note: "Clean separation: MCP server = data layer, Steward = chat UI + AI" }
        ]
      },
      {
        id: 2, title: "Steward consumes its own MCP server",
        description: "Steward should be the first consumer of the MCP server — proving the abstraction works before other apps adopt it",
        solutions: [
          { title: "Replace direct API calls in Steward with MCP tool calls", effort: "M", impact: "H", source: "Steward refactor", note: "Gradual migration: one data source at a time, starting with Wings" },
          { title: "MCP client in Steward's API routes", effort: "S", impact: "H", source: "@modelcontextprotocol/sdk", note: "Steward calls MCP tools instead of importing lib/ functions directly" },
          { title: "Keep direct imports as fallback during migration", effort: "S", impact: "M", source: "Feature flag", note: "Toggle between direct and MCP — rollback safety" }
        ]
      },
      {
        id: 3, title: "Caching strategy across consumers",
        description: "Multiple apps hitting the same APIs need coordinated caching — not each app caching independently",
        solutions: [
          { title: "MCP server owns the Redis cache layer", effort: "M", impact: "H", source: "Upstash Redis", note: "Cache lives in the MCP server — consumers get cached responses transparently" },
          { title: "Keep Steward's L1 in-memory cache for hot data", effort: "S", impact: "M", source: "Existing L1 cache", note: "MCP handles L2/L3, each app can still have its own L1" },
          { title: "Cache invalidation via MCP notifications", effort: "H", impact: "M", source: "MCP protocol", note: "MCP server notifies consumers when cached data is refreshed" }
        ]
      },
      {
        id: 4, title: "Auth and access control at the MCP level",
        description: "Different apps may have different permission levels — the MCP server needs to enforce who can access what",
        solutions: [
          { title: "Pass user context (email, roles) with each MCP call", effort: "S", impact: "H", source: "MCP tool parameters", note: "MCP server checks permissions per tool based on caller's roles" },
          { title: "API key per consumer app", effort: "S", impact: "M", source: "Environment config", note: "Simple auth: Steward has key A, planning app has key B — different access levels" },
          { title: "Reuse existing role-access system from Notion", effort: "S", impact: "H", source: "Notion Role Access DB", note: "Same roles/capabilities model already in Steward — expose via MCP" }
        ]
      }
    ],
    mvp: [
      "MCP server with 3-5 core tools: getInstructorSchedule, getStudentProfile, getFaqs, getProducts, getRoleAccess",
      "Wrap existing Steward lib/ functions — no new API integrations needed",
      "Steward connects as first consumer (Wings schedule as pilot)",
      "Redis caching owned by MCP server (reuse existing Upstash setup)",
      "Deploy as standalone service on Scaleway"
    ],
    outOfScope: "Migrating all Steward data fetching to MCP at once — gradual migration, one source at a time. MCP notifications and real-time subscriptions — v2.",
    hypotheses: [
      { h: "Extracting the data layer into MCP reduces development time for the next app by >50%", test: "Build a simple second consumer (e.g. CLI tool or Slack bot) — measure time to first working query" },
      { h: "The overhead of MCP (serialization, network hop) is negligible compared to the underlying API calls", test: "Benchmark: direct Wings API call vs. same call through MCP server — latency difference <50ms?" },
      { h: "Having a shared data layer makes it easier to keep data consistent across apps", test: "Run Steward + second app side by side — do they always show the same schedule data?" },
      { h: "The existing Steward lib/ functions can be wrapped as MCP tools with minimal refactoring", test: "Try wrapping wings.ts getInstructorBookings as an MCP tool — how much code changes?" }
    ]
  }
];

// ─── CD Structure: Outcome → Opportunity → Solutions ────────────────

interface Interview {
  date: string;
  who: string;
  role: string;
  insights: string[];
}

interface CDOpportunity {
  id: string;
  title: string;
  description: string;
  interviews: Interview[];
  solutionIds: string[];
}

interface ProductOutcome {
  id: string;
  audience: Role;
  icon: string;
  title: string;
  metric: string;
  opportunities: CDOpportunity[];
}

const outcomes: ProductOutcome[] = [
  {
    id: "instructeur",
    audience: "instructeur",
    icon: "✈️",
    title: "Instructors spend less time on admin and more time teaching",
    metric: "Less preparation • Faster compliance checks • Better lesson quality",
    opportunities: [
      {
        id: "lesson-prep-time",
        title: "Lesson preparation takes too long",
        description: "Instructors open multiple gradesheets, search for checklists, and don't know where to focus",
        interviews: [
          { date: "2026-03-10", who: "Peter", role: "Instructor", insights: [
            "Wants to see last 5 lessons only (not more)",
            "Instructor name per lesson is a must-have",
            "Wants to see actual comments, not just scores",
            "Wants to compare summary against original comments (trust issue)",
            "Checklist items only visible after creating lesson in Wings — wants to see them beforehand"
          ] },
          { date: "2026-03-10", who: "Stephanie", role: "Instructor", insights: [
            "Primarily wants to see hot items — what's most important to watch for",
            "Briefing should be short and compact, not too long"
          ] },
          { date: "2026-03-10", who: "Evert-Jan", role: "Instructor", insights: [
            "Lesson preparation is already in the lesson cards — pay attention to those",
            "Focus should be on compliance and document validation, not lesson content"
          ] }
        ],
        solutionIds: ["remarks", "pre-lesson-checklist", "briefing"]
      },
      {
        id: "no-daily-overview",
        title: "No combined daily overview",
        description: "No merged overview of weather, lessons, notices, and student attention points",
        interviews: [
          { date: "2026-03-10", who: "Mirella", role: "Instructor", insights: [
            "Wants features with runway length information — relevant for lesson planning and briefing",
            "Operational context (runway, weather, restrictions) belongs in the daily overview"
          ] }
        ],
        solutionIds: ["daily-briefing", "cancellation"]
      },
      {
        id: "student-progress-opaque",
        title: "Student progress not quickly visible",
        description: "Has to scroll through all report cards to get a complete picture of a student",
        interviews: [],
        solutionIds: ["progress", "comment-standardization"]
      },
      {
        id: "compliance-manual",
        title: "Compliance checks are scattered and manual",
        description: "Medical, license, solo requirements are in different places — instructor has to search themselves",
        interviews: [
          { date: "2026-03-10", who: "Evert-Jan", role: "Instructor", insights: [
            "Compliance is the most important thing — Steward would really add value here",
            "Checking document validity is currently manual and error-prone"
          ] },
          { date: "2026-03-10", who: "Stephanie", role: "Instructor", insights: [
            "For document checks you need to see the document name — not just 'valid/invalid'"
          ] }
        ],
        solutionIds: ["license-medical-check", "solo-check"]
      },
      {
        id: "logbook-errors",
        title: "Logbook maintenance is error-prone and time-consuming",
        description: "Manually transcribing Hobbs meter and clock times leads to calculation errors",
        interviews: [],
        solutionIds: ["logbook"]
      }
    ]
  },
  {
    id: "student",
    audience: "student",
    icon: "🎓",
    title: "Students can learn faster",
    metric: "Better prepared • Less confusion • Faster through the training pathway",
    opportunities: [
      {
        id: "lesson-prep-student",
        title: "Student doesn't know how to prepare for the lesson",
        description: "Student searches handbooks themselves without knowing what's relevant for the upcoming lesson",
        interviews: [],
        solutionIds: ["lesson-prep"]
      },
      {
        id: "no-training-overview",
        title: "No overview of the full training pathway",
        description: "Student has no picture of what needs to happen outside practical lessons — theory, exams, medicals, administration",
        interviews: [],
        solutionIds: ["student-guidance"]
      },
      {
        id: "no-feedback-channel",
        title: "No channel for feedback on the instructor",
        description: "Students cannot anonymously indicate how they experience the lesson",
        interviews: [],
        solutionIds: ["instructor-feedback"]
      }
    ]
  },
  {
    id: "operations",
    audience: "systeem",
    icon: "⚙️",
    title: "Operations spends less time on manual work and answering questions",
    metric: "Fewer repeat questions • Better self-service • Scalable platform",
    opportunities: [
      {
        id: "trust-gap",
        title: "Users don't trust Steward enough and don't know what it can do",
        description: "New users don't know what Steward can do, don't trust answers, or set wrong expectations",
        interviews: [],
        solutionIds: ["onboarding-expectations", "confidence-display", "data-source-transparency"]
      },
      {
        id: "critical-questions",
        title: "Critical questions are not handled safely",
        description: "For questions about solo, medicals, or emergency procedures a wrong answer can have dangerous consequences",
        interviews: [],
        solutionIds: ["escalation-guardrails"]
      },
      {
        id: "content-access",
        title: "Content and knowledge hard to reach",
        description: "FAQ management is technical, reference documents not available in the chat",
        interviews: [],
        solutionIds: ["faq-images", "knowledge-injection"]
      },
      {
        id: "platform-scale",
        title: "Platform not hands-free and not scalable to multiple apps",
        description: "Voice output missing, data integrations locked into one app",
        interviews: [],
        solutionIds: ["voice-output", "mcp-data-layer"]
      },
      {
        id: "platform-perf",
        title: "Platform performance and efficiency",
        description: "Token costs, load times, and perceived performance can be improved",
        interviews: [],
        solutionIds: ["toon", "pulse"]
      },
      {
        id: "chat-to-action",
        title: "Users prefer typing over clicking buttons",
        description: "Instructors ignore capability buttons and type their question directly in chat — e.g. 'what is my schedule' or 'who am I teaching today'. The chat input should recognize this and trigger the right data action directly without Gemini in between.",
        interviews: [
          { date: "2026-03-10", who: "Matthijs (observation)", role: "Product owner", insights: [
            "Instructors wanted to chat directly, not click 'My Schedule'",
            "They typed 'what is my schedule' or 'who am I teaching today' in the chat",
            "Conclusion: Gemini flow should be able to switch to Direct flow based on chat input",
            "Intent detection needed: chat input matches capability → skip Gemini, fetch data directly"
          ] }
        ],
        solutionIds: []
      }
    ]
  },
  {
    id: "safety",
    audience: "beide",
    icon: "🛡️",
    title: "Safer and more compliant by not missing things",
    metric: "No expired documents missed • No unsafe solo flights • Critical questions always escalated to humans",
    opportunities: [
      {
        id: "document-expiry",
        title: "Expired documents go unnoticed",
        description: "Medical certificates, licenses, and endorsements can expire without anyone catching it before the flight",
        interviews: [
          { date: "2026-03-10", who: "Evert-Jan", role: "Instructor", insights: [
            "Document validity checking is the highest-value compliance feature",
            "Currently manual and error-prone — easy to miss an expiry"
          ] },
          { date: "2026-03-10", who: "Stephanie", role: "Instructor", insights: [
            "Need to see the actual document name, not just valid/invalid status"
          ] }
        ],
        solutionIds: ["license-medical-check", "solo-check"]
      },
      {
        id: "unsafe-ai-answers",
        title: "AI gives answers on safety-critical topics without proper guardrails",
        description: "Questions about solo authorization, emergency procedures, or medical validity need human oversight — a wrong AI answer can have real consequences",
        interviews: [],
        solutionIds: ["escalation-guardrails", "confidence-display"]
      },
      {
        id: "compliance-visibility",
        title: "Compliance status is not proactively surfaced",
        description: "Instead of requiring instructors to actively check, the system should warn them when something is about to expire or is missing",
        interviews: [
          { date: "2026-03-10", who: "Evert-Jan", role: "Instructor", insights: [
            "Compliance is the most important thing — Steward should proactively flag issues",
            "Focus on preventing problems, not just answering questions"
          ] }
        ],
        solutionIds: ["license-medical-check", "solo-check", "data-source-transparency"]
      }
    ]
  }
];

// Helper: look up feature by ID
function featureById(id: string): Feature | undefined {
  return features.find((f) => f.id === id);
}

// All solution IDs that appear in outcomes (to detect orphans)
const mappedIds = new Set(outcomes.flatMap((o) => o.opportunities.flatMap((opp) => opp.solutionIds)));

// ─── Constants ──────────────────────────────────────────────────────
const effortColors: Record<Effort, string> = { S: "#16a34a", M: "#d97706", H: "#dc2626" };
const effortLabels: Record<Effort, string> = { S: "Small", M: "Medium", H: "Large" };
const effortTw: Record<Effort, string> = {
  S: "bg-green-50 text-green-700 border-green-200",
  M: "bg-amber-50 text-amber-700 border-amber-200",
  H: "bg-red-50 text-red-700 border-red-200",
};
const roleColors: Record<Role, { bg: string; text: string; border: string }> = {
  instructeur: { bg: "bg-e-indigo-light/30", text: "text-[#1515F5]", border: "border-[#A1A1FB]" },
  student: { bg: "bg-e-mint-light/50", text: "text-[#1B7A57]", border: "border-[#85D9BF]" },
  beide: { bg: "bg-[#FFF3E0]", text: "text-[#B86E00]", border: "border-[#FFD699]" },
  systeem: { bg: "bg-e-pink/30", text: "text-[#8B2FA8]", border: "border-[#DFB6EE]" },
};
const roleLabels: Record<Role | "alle", string> = {
  instructeur: "✈️ Instructor",
  student: "🎓 Student",
  beide: "🛡️ All roles",
  systeem: "⚙️ Operations",
  alle: "👁 All"
};
const statusTw: Record<string, string> = {
  "Live": "bg-blue-50 text-blue-700",
  "Priority": "bg-green-50 text-green-700",
  "Backlog": "bg-amber-50 text-amber-700",
  "Technical": "bg-purple-50 text-purple-700",
  "Done ✓": "bg-green-50 text-green-700",
};

interface Group { label: string; filter: (f: Feature) => boolean }
const groups: Group[] = [
  { label: "🔥 Build now", filter: (f) => f.priority === 1 && f.status !== "Live" && f.status !== "Done ✓" },
  { label: "📋 Backlog", filter: (f) => f.priority === 2 && f.status !== "Technical" },
  { label: "🔧 Technical improvements", filter: (f) => f.status === "Technical" },
  { label: "⚠️ Validate first", filter: (f) => f.priority === 3 },
  { label: "🚀 Live & Done", filter: (f) => f.status === "Live" || f.status === "Done ✓" },
];

// ─── Page ───────────────────────────────────────────────────────────
type ViewMode = "overview" | "detail";
type TabMode = "tree" | "mvp" | "hypotheses";

const audienceColors: Record<string, { bg: string; border: string; text: string; light: string }> = {
  instructeur: { bg: "bg-e-indigo", border: "border-[#A1A1FB]", text: "text-[#1515F5]", light: "bg-[#F0F0FF]" },
  student: { bg: "bg-e-mint", border: "border-[#85D9BF]", text: "text-[#1B7A57]", light: "bg-[#DAF4EC]" },
  systeem: { bg: "bg-e-pink-light", border: "border-[#DFB6EE]", text: "text-[#8B2FA8]", light: "bg-[#F5E6FA]" },
  beide: { bg: "bg-[#FFF3E0]", border: "border-[#FFD699]", text: "text-[#B86E00]", light: "bg-[#FFF8ED]" },
};

const audienceLabels: Record<string, string> = {
  instructeur: "Instructor",
  student: "Student",
  systeem: "Operations",
  beide: "Safety & Compliance",
};

export default function DesignPage() {
  const [authState, setAuthState] = useState<"loading" | "denied" | "allowed">("loading");
  const [activeOutcome, setActiveOutcome] = useState("instructeur");
  const [activeOppId, setActiveOppId] = useState("");
  const [activeSolId, setActiveSolId] = useState("");
  const [activeSubProblem, setActiveSubProblem] = useState(0);
  const [activeTab, setActiveTab] = useState<TabMode>("tree");
  const [view, setView] = useState<ViewMode>("overview");
  const [copied, setCopied] = useState<string | null>(null);
  const [boardSegment, setBoardSegment] = useState<"build" | "done">("build");

  useEffect(() => {
    if (process.env.NODE_ENV === "development") { setAuthState("allowed"); return; }
    fetch("/api/auth/shopify/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) { setAuthState("denied"); return; }
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
        <div className="text-sm text-e-grey">Loading...</div>
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

  const openSolution = (outcomeId: string, oppId: string, solId: string) => {
    setActiveOutcome(outcomeId);
    setActiveOppId(oppId);
    setActiveSolId(solId);
    setActiveSubProblem(0);
    setActiveTab("tree");
    setView("detail");
  };

  const copyRef = (f: Feature, opp?: CDOpportunity, section?: string) => {
    const outcome = outcomes.find((o) => o.opportunities.some((op) => op.solutionIds.includes(f.id)));
    const parts = [`[CD:${f.id}] ${f.label}`];
    if (outcome) parts.push(`Outcome: ${outcome.title}`);
    if (opp) parts.push(`Opportunity: ${opp.title}`);
    parts.push(`Solution: ${f.outcome.title}`);
    if (section) parts.push(`Tab: ${section}`);
    navigator.clipboard.writeText(parts.join("\n")).then(() => {
      setCopied(f.id + (section || ""));
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const currentOutcome = outcomes.find((o) => o.id === activeOutcome);
  const currentOpp = currentOutcome?.opportunities.find((o) => o.id === activeOppId);
  const currentSol = activeSolId ? featureById(activeSolId) : undefined;

  return (
    <div className="min-h-screen bg-background p-8 fixed inset-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <DocsNav active="discovery" />
          <h1 className="text-3xl font-bold text-e-indigo-dark mb-2 mt-6">Continuous Discovery</h1>
          <p className="text-e-grey">Outcome → Opportunity → Solution. Structured based on user interviews.</p>
        </div>

        {/* View toggle */}
        <div className="flex flex-wrap items-center gap-2">
          {outcomes.map((o) => {
            const c = audienceColors[o.audience];
            return (
              <button key={o.id} onClick={() => { setActiveOutcome(o.id); if (view === "detail") setView("overview"); }}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                  activeOutcome === o.id ? `${c.light} ${c.text} ${c.border}` : "bg-white text-[#828282] border-[#ECECEC] hover:border-[#A1A1FB]"
                }`}>
                {o.icon} {audienceLabels[o.audience] || o.audience}
              </button>
            );
          })}
        </div>

        {/* ── Build Next / Live & Done ───────────────────────────── */}
        {view === "overview" && (() => {
          const buildNext = outcomes.flatMap((o) =>
            o.opportunities.flatMap((opp) =>
              opp.solutionIds
                .map(featureById)
                .filter((f): f is Feature => !!f && f.priority === 1 && f.status !== "Live" && f.status !== "Done ✓")
                .map((f) => ({ feature: f, opportunity: opp, outcome: o }))
            )
          );
          const liveDone = outcomes.flatMap((o) =>
            o.opportunities.flatMap((opp) =>
              opp.solutionIds
                .map(featureById)
                .filter((f): f is Feature => !!f && (f.status === "Live" || f.status === "Done ✓"))
                .map((f) => ({ feature: f, opportunity: opp, outcome: o }))
            )
          );
          const items = boardSegment === "build" ? buildNext : liveDone;
          if (buildNext.length === 0 && liveDone.length === 0) return null;
          return (
            <div className={`bg-white border-2 rounded-xl p-5 ${boardSegment === "build" ? "border-[#1515F5]" : "border-green-300"}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex bg-[#F2F2F2] rounded-lg p-0.5 gap-0.5">
                  <button onClick={() => setBoardSegment("build")}
                    className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-md cursor-pointer transition-colors ${boardSegment === "build" ? "bg-white text-[#1515F5] shadow-sm" : "text-[#828282] hover:text-foreground"}`}>
                    🔥 Build next ({buildNext.length})
                  </button>
                  <button onClick={() => setBoardSegment("done")}
                    className={`text-[10px] font-bold tracking-wider uppercase px-3 py-1 rounded-md cursor-pointer transition-colors ${boardSegment === "done" ? "bg-white text-green-700 shadow-sm" : "text-[#828282] hover:text-foreground"}`}>
                    🚀 Live & Done ({liveDone.length})
                  </button>
                </div>
                <span className="text-[10px] text-[#828282]">
                  {boardSegment === "build" ? "highest priority based on interview evidence" : "shipped and verified"}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-[#828282] text-center py-4">No items</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {items.map(({ feature: f, opportunity: opp, outcome: o }) => (
                    <button key={f.id} onClick={() => openSolution(o.id, opp.id, f.id)}
                      className={`text-left p-3 rounded-lg border border-[#ECECEC] hover:shadow-sm transition-all cursor-pointer font-[inherit] ${boardSegment === "build" ? "hover:border-[#A1A1FB]" : "hover:border-green-400"}`}>
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-xs font-semibold text-foreground">{f.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTw[f.status] || "bg-gray-50 text-gray-600"}`}>{f.status}</span>
                      </div>
                      <p className="text-[11px] text-[#828282] leading-snug mb-1">
                        {opp.title}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[#ABABAB]">{o.icon} {audienceLabels[o.audience]}</span>
                        {boardSegment === "build" && opp.interviews.length > 0 && <span className="text-[10px] text-green-600">🎙 {opp.interviews.length}</span>}
                        {boardSegment === "build" && f.votes != null && <span className="text-[10px] text-e-indigo">🗳 {f.votes}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Overview ──────────────────────────────────────────── */}
        {view === "overview" && outcomes.map((outcome) => {
          if (activeOutcome !== outcome.id) return null;
          const c = audienceColors[outcome.audience];
          return (
            <div key={outcome.id} className="space-y-6">
              {/* Product Outcome card */}
              <div className={`${c.light} border-2 ${c.border} rounded-xl p-5`}>
                <p className={`text-[10px] font-bold tracking-widest ${c.text} uppercase mb-2`}>🎯 Product Outcome — {outcome.icon} {audienceLabels[outcome.audience] || outcome.audience}</p>
                <p className="text-sm font-semibold text-foreground leading-relaxed mb-1">{outcome.title}</p>
                <p className="text-xs text-[#828282] font-mono">{outcome.metric}</p>
              </div>

              {/* Opportunities */}
              {outcome.opportunities.map((opp) => {
                const sols = opp.solutionIds.map(featureById).filter(Boolean) as Feature[];
                const interviewCount = opp.interviews.length;
                return (
                  <div key={opp.id} className="bg-white border border-[#ECECEC] rounded-xl p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className={`text-[10px] font-bold tracking-widest ${c.text} uppercase mb-1`}>Opportunity</p>
                        <h3 className="text-sm font-semibold text-foreground">{opp.title}</h3>
                        <p className="text-xs text-[#828282] mt-1">{opp.description}</p>
                      </div>
                      {interviewCount > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 whitespace-nowrap">
                          🎙 {interviewCount} interview{interviewCount > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    {/* Interview insights */}
                    {opp.interviews.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {opp.interviews.map((iv, i) => (
                          <div key={i} className="bg-[#FAFAFA] rounded-lg p-3 border-l-3 border-green-400">
                            <p className="text-[10px] text-green-700 font-medium mb-1">🎙 {iv.who} ({iv.role}) — {iv.date}</p>
                            <ul className="space-y-0.5">
                              {iv.insights.map((ins, j) => (
                                <li key={j} className="text-xs text-[#828282] flex gap-1.5">
                                  <span className="text-green-500 shrink-0">•</span>
                                  {ins}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Solutions */}
                    <p className="text-[10px] text-[#ABABAB] uppercase tracking-wider font-medium mb-2">Solutions</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {sols.map((f) => (
                        <button key={f.id} onClick={() => openSolution(outcome.id, opp.id, f.id)}
                          className="text-left p-3 rounded-lg border border-[#ECECEC] hover:border-[#A1A1FB] hover:shadow-sm transition-all cursor-pointer font-[inherit]">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-xs font-semibold text-foreground">{f.label}</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTw[f.status] || "bg-gray-50 text-gray-600"}`}>{f.status}</span>
                          </div>
                          <p className="text-[11px] text-[#828282] leading-snug">
                            {f.outcome.title.length > 80 ? f.outcome.title.slice(0, 80) + "…" : f.outcome.title}
                          </p>
                          <div className="flex justify-between items-center mt-2">
                            {f.votes != null
                              ? <span className="text-[10px] text-e-indigo font-medium">🗳 {f.votes}</span>
                              : <span className="text-[10px] text-[#ABABAB]">Internal</span>}
                            {f.userRequest && <span className="text-[10px] text-purple-500">★ Requested</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* ── Detail ──────────────────────────────────────────── */}
        {view === "detail" && currentOutcome && currentOpp && currentSol && (
          <div className="space-y-5">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-xs text-[#828282]">
              <button onClick={() => setView("overview")} className="hover:text-[#1515F5] cursor-pointer">{currentOutcome.icon} {audienceLabels[currentOutcome.audience] || currentOutcome.audience}</button>
              <span>→</span>
              <span className="text-foreground font-medium">{currentOpp.title}</span>
            </div>

            {/* Solution selector pills */}
            <div className="flex flex-wrap gap-1.5">
              {currentOpp.solutionIds.map((sid) => {
                const f = featureById(sid);
                if (!f) return null;
                return (
                  <button key={sid} onClick={() => { setActiveSolId(sid); setActiveSubProblem(0); setActiveTab("tree"); }}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border cursor-pointer transition-colors ${
                      activeSolId === sid ? "bg-e-indigo-light/30 text-[#1515F5] border-[#A1A1FB]" : "bg-white text-[#828282] border-[#ECECEC] hover:border-[#A1A1FB]"
                    }`}>
                    {f.label}
                    {f.votes != null && <span className="ml-1 opacity-60">·{f.votes}</span>}
                    {f.userRequest && <span className="ml-1 text-purple-500">★</span>}
                  </button>
                );
              })}
            </div>

            {/* Solution outcome card */}
            <div className="bg-[#F0F0FF] border-2 border-[#A1A1FB] rounded-xl p-5">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold tracking-widest text-[#1515F5] uppercase">💡 Solution</span>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => copyRef(currentSol, currentOpp)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-white/70 text-[#1515F5] border border-[#A1A1FB] hover:bg-white transition-colors cursor-pointer">
                    {copied === currentSol.id ? "✓ Copied" : "📋 Copy ref"}
                  </button>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTw[currentSol.status] || "bg-gray-50 text-gray-600"}`}>
                    {currentSol.status}{currentSol.votes != null ? ` · ${currentSol.votes} votes` : ""}
                  </span>
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground leading-relaxed mb-1">{currentSol.outcome.title}</p>
              <p className="text-xs text-[#828282] font-mono">{currentSol.outcome.metric}</p>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1 bg-[#F2F2F2] rounded-lg p-0.5 w-fit">
                {(["tree", "mvp", "hypotheses"] as const).map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`text-sm font-medium px-4 py-1.5 rounded-md transition-colors cursor-pointer ${
                    activeTab === tab ? "bg-white text-foreground shadow-sm" : "text-[#828282] hover:text-foreground"
                  }`}>
                    {{ tree: "Sub-problems", mvp: "MVP Scope", hypotheses: "Hypotheses" }[tab]}
                  </button>
                ))}
              </div>
              <button onClick={() => copyRef(currentSol, currentOpp, { tree: "Sub-problems", mvp: "MVP Scope", hypotheses: "Hypotheses" }[activeTab])}
                className="text-[10px] px-2 py-1 rounded-full bg-white text-[#828282] border border-[#ECECEC] hover:border-[#A1A1FB] hover:text-[#1515F5] transition-colors cursor-pointer">
                {copied === currentSol.id + { tree: "Sub-problems", mvp: "MVP Scope", hypotheses: "Hypotheses" }[activeTab] ? "✓" : "📋"}
              </button>
            </div>

            {/* ── Sub-problems & Approaches ──────────────────── */}
            {activeTab === "tree" && (
              <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
                <div className="flex flex-col gap-2">
                  {currentSol.opportunities.map((opp, i) => (
                    <button key={opp.id} onClick={() => setActiveSubProblem(i)} className={`text-left p-3 rounded-lg border cursor-pointer transition-all font-[inherit] ${
                      activeSubProblem === i ? "bg-[#F0F0FF] border-[#A1A1FB]" : "bg-white border-[#ECECEC] hover:border-[#A1A1FB]"
                    }`}>
                      <span className="text-[10px] text-[#1515F5] font-mono font-medium">SP-{opp.id}</span>
                      <p className="text-xs font-semibold text-foreground mt-1">{opp.title}</p>
                      <p className="text-[11px] text-[#828282] mt-1 leading-snug">{opp.description}</p>
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-[10px] text-[#828282] uppercase tracking-wider font-medium mb-2">
                    Approaches → {currentSol.opportunities[activeSubProblem]?.title}
                  </p>
                  {currentSol.opportunities[activeSubProblem]?.solutions.map((sol, i) => (
                    <div key={i} className="bg-white border border-[#ECECEC] rounded-lg p-4 flex justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{sol.title}</p>
                        <p className="text-xs text-[#828282] mt-0.5"><span className="text-[#ABABAB]">Source: </span>{sol.source}</p>
                        <p className="text-xs text-[#ABABAB] italic mt-0.5">{sol.note}</p>
                      </div>
                      <div className="flex gap-2 items-center shrink-0">
                        {(["effort", "impact"] as const).map((type) => (
                          <div key={type} className="text-center">
                            <p className="text-[10px] text-[#ABABAB] uppercase mb-1">{type}</p>
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded border ${effortTw[sol[type]]}`}>
                              {effortLabels[sol[type]]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── MVP Scope ──────────────────────────────────── */}
            {activeTab === "mvp" && (
              <div className="space-y-2">
                <p className="text-xs text-[#828282] mb-3">Minimum scope for first working version.</p>
                {currentSol.mvp.map((item, i) => (
                  <div key={i} className="bg-white border border-[#ECECEC] rounded-lg px-4 py-3 flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#F0F0FF] border border-[#A1A1FB] flex items-center justify-center text-[11px] font-bold text-[#1515F5] shrink-0">{i + 1}</span>
                    <span className="text-sm text-foreground">{item}</span>
                  </div>
                ))}
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mt-2">
                  <p className="text-[11px] font-semibold text-green-700 mb-1">✓ Out of scope v1</p>
                  <p className="text-xs text-[#828282]">{currentSol.outOfScope}</p>
                </div>
              </div>
            )}

            {/* ── Hypotheses ──────────────────────────────────── */}
            {activeTab === "hypotheses" && (
              <div className="space-y-3">
                <p className="text-xs text-[#828282] mb-2">Validate before you build.</p>
                {currentSol.hypotheses.map((item, i) => (
                  <div key={i} className="bg-white border border-[#ECECEC] rounded-lg p-4">
                    <p className="text-[10px] text-amber-600 uppercase tracking-wider font-bold mb-2">Hypothesis {i + 1}</p>
                    <p className="text-sm font-medium text-foreground leading-relaxed mb-3">&ldquo;{item.h}&rdquo;</p>
                    <div className="bg-[#FAFAFA] rounded-md p-3 border-l-3 border-amber-400">
                      <p className="text-[10px] text-[#ABABAB] uppercase tracking-wider mb-1">How to test</p>
                      <p className="text-xs text-[#828282] leading-relaxed">{item.test}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
