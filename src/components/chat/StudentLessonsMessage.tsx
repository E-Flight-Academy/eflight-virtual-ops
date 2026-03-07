"use client";

import { useState } from "react";
import type { StudentLessonsData } from "@/types/chat";
import SegmentedController from "./SegmentedController";

interface StudentLessonsMessageProps {
  data: StudentLessonsData;
  summary: string;
  onBookingClick?: (bookingId: number, date: string, time: string, student: string) => void;
}

const MAX_VISIBLE = 10;

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 4 ? "bg-green-100 text-green-700" :
    score >= 3 ? "bg-amber-100 text-amber-700" :
    "bg-red-100 text-red-700";
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${color}`}>
      {score.toFixed(1)}
    </span>
  );
}

function getInitials(name: string | null): string {
  if (!name) return "—";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}

export default function StudentLessonsMessage({ data, summary, onBookingClick }: StudentLessonsMessageProps) {
  const [activeCourse, setActiveCourse] = useState(0);
  const [expanded, setExpanded] = useState(false);

  if (data.courses.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl rounded-tl-sm shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] p-4">
        <p className="text-sm text-[#828282]">No lessons found for {data.studentName}.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl rounded-tl-sm shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{data.studentName}</h3>
          <span className="text-xs text-[#828282]">{data.totalLessons} lessons</span>
        </div>
      </div>

      {/* Segmented controller */}
      {data.courses.length > 1 && (
        <div className="px-3 pb-2">
          <SegmentedController
            tabs={data.courses.map((c, i) => ({ key: String(i), label: c.courseName, count: c.lessons.length }))}
            activeKey={String(activeCourse)}
            onSelect={(key) => { setActiveCourse(Number(key)); setExpanded(false); }}
          />
        </div>
      )}

      {/* Lesson list — grid keeps width stable across tab switches */}
      <div className="grid">
        {data.courses.map((c, courseIdx) => {
          const visible = courseIdx === activeCourse;
          const lessons = expanded ? c.lessons : c.lessons.slice(0, MAX_VISIBLE);
          const courseHasMore = c.lessons.length > MAX_VISIBLE;
          return (
            <div
              key={c.courseName}
              className={`col-start-1 row-start-1 ${visible ? "" : "h-0 overflow-hidden invisible"}`}
              aria-hidden={!visible}
            >
              <div className="divide-y divide-[#F2F2F2] dark:divide-gray-800">
                {lessons.map((lesson) => (
                  <button
                    key={lesson.bookingId}
                    onClick={() => onBookingClick?.(lesson.bookingId, lesson.date, "", data.studentName)}
                    className="w-full text-left px-4 py-2.5 hover:bg-[#FAFAFA] dark:hover:bg-gray-800 transition-colors cursor-pointer flex items-center gap-3"
                  >
                    <div className="text-xs text-[#828282] w-20 shrink-0">
                      {formatDate(lesson.date)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm truncate block ${lesson.isAssessment ? "font-semibold text-[#1515F5]" : "text-foreground"}`}>
                        {lesson.planName || "—"}
                      </span>
                    </div>
                    <span className="text-xs text-[#ABABAB] w-10 text-center shrink-0" title={lesson.instructor || ""}>
                      {getInitials(lesson.instructor)}
                    </span>
                    <div className="w-10 text-right shrink-0">
                      <ScoreBadge score={lesson.avgScore} />
                    </div>
                  </button>
                ))}
              </div>
              {courseHasMore && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2 text-xs text-e-grey hover:text-[#1515F5] transition-colors cursor-pointer border-t border-[#F2F2F2] dark:border-gray-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points={expanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                  </svg>
                  {expanded ? "Show less" : `Show ${c.lessons.length - MAX_VISIBLE} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#F2F2F2] dark:border-gray-800">
        <p className="text-xs text-[#ABABAB]">{summary}</p>
      </div>
    </div>
  );
}
