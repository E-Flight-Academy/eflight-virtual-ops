"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { BriefingData } from "@/types/chat";

interface BriefingMessageProps {
  data: BriefingData;
  summary: string;
}

const SECTION_ICONS: Record<string, string> = {
  // English
  "Objective": "crosshair",
  "Preparation": "clipboard",
  "Briefing": "message-square",
  "Watch Points": "alert-triangle",
  "Exercise": "wind",
  // Dutch
  "Doel": "crosshair",
  "Voorbereiding": "clipboard",
  "Aandachtspunten": "alert-triangle",
  "Oefening": "wind",
};

function SectionIcon({ title }: { title: string }) {
  const icon = SECTION_ICONS[title] || "book-open";
  const paths: Record<string, React.ReactNode> = {
    "crosshair": <>
      <circle cx="12" cy="12" r="10" /><line x1="22" y1="12" x2="18" y2="12" />
      <line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="6" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="18" />
    </>,
    "clipboard": <>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    </>,
    "message-square": <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>,
    "alert-triangle": <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
    "wind": <><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2" /></>,
    "book-open": <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  };

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0 text-[#1515F5]"
    >
      {paths[icon] || paths["book-open"]}
    </svg>
  );
}

export default function BriefingMessage({ data, summary }: BriefingMessageProps) {
  const [expandedSections, setExpandedSections] = useState<Set<number>>(
    () => new Set(data.sections.map((_, i) => i)) // all expanded by default
  );

  const toggleSection = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const nextLabel = data.isNextLesson
    ? (data.lang === "nl" ? "Volgende les" : "Next lesson")
    : (data.lang === "nl" ? "Deze les" : "This lesson");

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            data.isNextLesson
              ? "bg-[#DCF9FF] text-[#0077A3]"
              : "bg-[#DAF4EC] text-[#1B7A57]"
          }`}>
            {nextLabel}
          </span>
          <span className="text-xs text-e-grey">#{data.exerciseNumber}</span>
        </div>
        <p className="font-semibold text-foreground mt-1">{data.lessonName}</p>
        <p className="text-sm text-e-grey">{data.courseName} · {data.studentName}</p>
      </div>

      {/* Sections */}
      <div className="space-y-2">
        {data.sections.map((section, i) => (
          <div key={i} className="border border-[#ECECEC] dark:border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection(i)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors cursor-pointer"
            >
              <SectionIcon title={section.title} />
              <span className="text-sm font-semibold text-foreground flex-1">{section.title}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`text-e-grey transition-transform ${expandedSections.has(i) ? "rotate-180" : ""}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {expandedSections.has(i) && (
              <div className="px-3 pb-3 prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0.5 prose-headings:my-1.5 text-sm">
                <ReactMarkdown>{section.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Student context indicator */}
      {data.studentContext && (
        <p className="text-[10px] text-e-grey">
          {data.lang === "nl" ? "Gebaseerd op leerlinggeschiedenis" : "Based on student history"}
        </p>
      )}
    </div>
  );
}
