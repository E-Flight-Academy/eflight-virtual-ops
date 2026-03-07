"use client";

import { useState, type ReactElement } from "react";
import type { BookingDetail } from "@/types/chat";

interface BookingDetailMessageProps {
  data: BookingDetail;
  summary: string;
  onBookingClick?: (bookingId: number, date: string, time: string, student: string) => void;
}

function linkifyPhones(text: string): (string | ReactElement)[] {
  const phoneRegex = /(\+?\d[\d\s\-().]{6,}\d)/g;
  const parts: (string | ReactElement)[] = [];
  let lastIndex = 0;
  let match;
  while ((match = phoneRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const raw = match[1];
    const digits = raw.replace(/[\s\-().]/g, "");
    if (digits.length >= 8) {
      parts.push(
        <a key={match.index} href={`tel:${digits}`} className="text-[#1515F5] underline hover:text-[#1010D0]">{raw}</a>
      );
    } else {
      parts.push(raw);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

function ScoreCircle({ score }: { score: number | null }) {
  if (score === null) return (
    <span className="w-5 h-5 rounded-full border-2 border-[#ABABAB] inline-flex items-center justify-center shrink-0" />
  );
  const colors: Record<number, string> = {
    1: "border-red-500 text-red-600",
    2: "border-amber-500 text-amber-600",
    3: "border-[#ABABAB] text-e-grey",
    4: "border-green-500 text-green-600",
    5: "border-green-600 text-green-700 bg-green-50 dark:bg-green-900/20",
  };
  return (
    <span className={`w-5 h-5 rounded-full border-2 inline-flex items-center justify-center text-[10px] font-bold shrink-0 ${colors[score] || "border-[#ABABAB] text-e-grey"}`}>
      {score}
    </span>
  );
}

type ScoreTab = 1 | 2 | 3 | 4 | 5;
const SCORE_TABS: ScoreTab[] = [1, 2, 3, 4, 5];
const MAX_SCORES_COLLAPSED = 6;

function LessonCommentsAndScores({ comments, records }: { comments: string | null; records: BookingDetail["lessons"][0]["records"] }) {
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const commentLines = comments?.split("\n") || [];
  const isLong = commentLines.length > 5;
  const scoredRecords = records.filter((r) => r.score !== null);

  // Group by score
  const byScore = new Map<number, typeof scoredRecords>();
  for (const r of scoredRecords) {
    const s = r.score!;
    if (!byScore.has(s)) byScore.set(s, []);
    byScore.get(s)!.push(r);
  }

  // Default tab: first score that has records
  const firstScore = SCORE_TABS.find((s) => byScore.has(s));
  const [activeScore, setActiveScore] = useState<ScoreTab>(firstScore || 3);
  const [scoresExpanded, setScoresExpanded] = useState(false);

  const activeRecords = byScore.get(activeScore) || [];
  const visibleRecords = scoresExpanded ? activeRecords : activeRecords.slice(0, MAX_SCORES_COLLAPSED);
  const hasMore = activeRecords.length > MAX_SCORES_COLLAPSED;

  if (!comments && scoredRecords.length === 0) return null;

  return (
    <div className="text-sm space-y-2">
      {/* Instructor comments */}
      {comments && (
        <div>
          <p className="text-xs text-e-grey mb-1">Comments</p>
          <p className={`text-sm text-foreground whitespace-pre-wrap ${!commentsExpanded && isLong ? "line-clamp-5" : ""}`}>
            {comments}
          </p>
          {isLong && (
            <button
              onClick={() => setCommentsExpanded(!commentsExpanded)}
              className="text-xs text-e-grey hover:text-[#1515F5] transition-colors cursor-pointer mt-1 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={commentsExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
              {commentsExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {/* Exercise scores */}
      {scoredRecords.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-e-grey">Scores ({scoredRecords.length})</p>

          {/* Segmented controller */}
          <div className="flex bg-[#F2F2F2] dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
            {SCORE_TABS.map((score) => {
              const count = byScore.get(score)?.length || 0;
              return (
                <button
                  key={score}
                  onClick={() => { setActiveScore(score); setScoresExpanded(false); }}
                  disabled={count === 0}
                  className={`flex-1 text-xs font-medium py-1.5 px-1 rounded-md transition-all ${
                    count === 0
                      ? "text-[#ABABAB]/40 cursor-default"
                      : activeScore === score
                      ? "bg-white dark:bg-gray-900 text-foreground shadow-sm cursor-pointer"
                      : "text-e-grey hover:text-foreground cursor-pointer"
                  }`}
                >
                  <span className="flex items-center justify-center gap-1">
                    <ScoreCircle score={count > 0 ? score : null} />
                    {count > 0 && <span className="text-e-grey">({count})</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Score items */}
          <div className="space-y-1">
            {visibleRecords.map((r, i) => (
              <div key={i} className="flex items-center gap-2 bg-[#F7F7F7] dark:bg-gray-800 rounded-lg px-2.5 py-1.5">
                <ScoreCircle score={r.score} />
                <span className="truncate flex-1 text-sm">{r.objectiveSummary}</span>
              </div>
            ))}
          </div>

          {hasMore && (
            <button
              onClick={() => setScoresExpanded(!scoresExpanded)}
              className="flex items-center gap-1.5 text-xs text-e-grey hover:text-[#1515F5] transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={scoresExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
              </svg>
              {scoresExpanded ? "Show less" : `Show ${activeRecords.length - MAX_SCORES_COLLAPSED} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BookingDetailMessage({ data, onBookingClick }: BookingDetailMessageProps) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
  };

  const lessonNames = data.lessons
    .map((l) => l.planName)
    .filter((n): n is string => n !== null);

  const isPast = data.date < new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">{data.student}</p>
          <p className="text-sm text-e-grey">
            {formatDate(data.date)} · {data.timeFrom}–{data.timeTo}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              data.status === "Confirmed"
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : data.status === "Declined"
                ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                : "bg-[#F2F2F2] text-e-grey dark:bg-gray-700"
            }`}
          >
            {data.status}
          </span>
          <a
            href={data.wingsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-e-grey hover:text-[#1515F5] transition-colors"
            title="Open in Wings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>

      {/* Booking notes (top) */}
      {data.comments && (
        <p className="text-sm text-foreground whitespace-pre-wrap">{linkifyPhones(data.comments)}</p>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div>
          <span className="text-e-grey">Instructor</span>
          <p className="font-medium">{data.instructor}</p>
        </div>
        <div>
          <span className="text-e-grey">Aircraft</span>
          <p className="font-medium">{data.aircraft}</p>
        </div>
        <div>
          <span className="text-e-grey">Course</span>
          <p className="font-medium">{data.type}</p>
        </div>
        <div>
          <span className="text-e-grey">Lesson</span>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {lessonNames.length > 0 ? lessonNames.map((name, i) => {
              const isAssessment = data.lessons[i]?.isAssessment;
              return (
                <span
                  key={i}
                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    isAssessment
                      ? "bg-[#ECD3F4] text-[#7B2D8E] dark:bg-[#7B2D8E]/20 dark:text-[#DFB6EE]"
                      : "bg-[#F2F2F2] dark:bg-gray-700 text-e-grey"
                  }`}
                >
                  {name}
                </span>
              );
            }) : (
              <span className="font-medium text-e-grey">—</span>
            )}
          </div>
        </div>
      </div>

      {/* Lesson details (past bookings only) */}
      {isPast && data.lessons.map((lesson) => (
        (lesson.comments || lesson.records.length > 0) && (
          <LessonCommentsAndScores key={lesson.id} comments={lesson.comments} records={lesson.records} />
        )
      ))}

      {/* Previous lesson */}
      {data.previousLesson ? (
        <div className="text-sm">
          <span className="text-e-grey text-xs">Previous lesson</span>
          <button
            onClick={() => onBookingClick?.(
              data.previousLesson!.bookingId,
              data.previousLesson!.date,
              "",
              data.student,
            )}
            className={`flex items-center gap-1.5 mt-0.5 px-2 py-1 rounded-lg transition-colors cursor-pointer hover:bg-[#F2F2F2] dark:hover:bg-gray-800 ${
              data.previousLesson.isAssessment
                ? "bg-[#ECD3F4]/30 hover:bg-[#ECD3F4]/50"
                : "bg-[#F7F7F7] dark:bg-gray-800"
            }`}
          >
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              data.previousLesson.isAssessment
                ? "bg-[#ECD3F4] text-[#7B2D8E] dark:bg-[#7B2D8E]/20 dark:text-[#DFB6EE]"
                : "bg-[#F2F2F2] dark:bg-gray-700 text-e-grey"
            }`}>
              {data.previousLesson.planName}
            </span>
            {data.previousLesson.status && (
              <span className="text-xs text-e-grey">{data.previousLesson.status}</span>
            )}
            <span className="text-xs text-e-grey">· {data.previousLesson.date.split("-").reverse().join("-")}</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey shrink-0">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="text-sm">
          <span className="text-e-grey text-xs">Previous lesson</span>
          <p className="text-e-grey mt-0.5">No previous lesson found</p>
        </div>
      )}

      {/* Document validity */}
      {data.userDocuments.length > 0 && (() => {
        // For past bookings: recalculate relative to booking date, only show expired
        const bookingDate = data.date;
        const filteredUsers = isPast
          ? data.userDocuments.map((u) => ({
              ...u,
              documents: u.documents.filter((d) => d.expires < bookingDate),
            })).filter((u) => u.documents.length > 0)
          : data.userDocuments;

        if (filteredUsers.length === 0) return null;

        const allDocs = filteredUsers.flatMap((u) => u.documents);
        const hasExpired = isPast ? true : allDocs.some((d) => d.isExpired);
        const hasWarning = !isPast && allDocs.some((d) => !d.isExpired && d.daysRemaining <= 14);
        const statusLabel = isPast
          ? "Expired on lesson date"
          : hasExpired ? "Action required" : hasWarning ? "Expiring soon" : "All OK";
        const statusColor = hasExpired
          ? "text-red-600 dark:text-red-400"
          : hasWarning
          ? "text-amber-600 dark:text-amber-400"
          : "text-green-600 dark:text-green-400";
        const statusDot = hasExpired
          ? "bg-red-500"
          : hasWarning
          ? "bg-amber-500"
          : "bg-green-500";

        return (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-e-grey font-medium">Document validity</p>
            <span className={`flex items-center gap-1.5 text-xs font-medium ${statusColor}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
              {statusLabel}
            </span>
          </div>
          {filteredUsers.map((user) => (
            <div key={user.userName} className="space-y-1">
              <a href={`https://eflight.oywings.com/students?search=${encodeURIComponent(user.userName)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-foreground hover:text-[#1515F5] transition-colors">{user.userName}</a>
              {user.documents.map((doc) => {
                const isWarning = !isPast && !doc.isExpired && doc.daysRemaining <= 14;
                return (
                  <div
                    key={doc.name}
                    className="flex items-center justify-between text-sm bg-[#F7F7F7] dark:bg-gray-800 rounded-lg px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {doc.isExpired ? (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" title="Expired" />
                      ) : isWarning ? (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500" title="Expiring soon" />
                      ) : (
                        <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" title="Valid" />
                      )}
                      <span className="truncate">{doc.name}</span>
                    </div>
                    <span
                      className={`text-xs shrink-0 ml-2 font-medium ${
                        doc.isExpired
                          ? "text-red-600 dark:text-red-400"
                          : isWarning
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-e-grey"
                      }`}
                    >
                      {doc.isExpired
                        ? `Expired ${Math.abs(doc.daysRemaining)}d ago`
                        : `${doc.daysRemaining}d · ${doc.expires}`}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        );
      })()}

      {/* Aircraft status */}
      {!isPast && data.aircraftStatus && (() => {
        const ac = data.aircraftStatus;
        const hasExpiredDoc = ac.documents.some((d) => d.isExpired);
        const hasWarningDoc = ac.documents.some((d) => !d.isExpired && d.daysRemaining <= 14);
        const hasNewRemark = ac.openRemarks.some((r) => r.isNew);
        const overallBad = !ac.serviceable || hasExpiredDoc;
        const overallWarn = hasWarningDoc || hasNewRemark;
        const statusLabel = !ac.serviceable ? "Unserviceable" : overallBad ? "Action required" : overallWarn ? "Attention" : "OK";
        const statusColor = overallBad
          ? "text-red-600 dark:text-red-400"
          : overallWarn
          ? "text-amber-600 dark:text-amber-400"
          : "text-green-600 dark:text-green-400";
        const statusDot = overallBad ? "bg-red-500" : overallWarn ? "bg-amber-500" : "bg-green-500";

        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <a href="https://eflight.oywings.com/aircraft" target="_blank" rel="noopener noreferrer" className="text-xs text-e-grey font-medium hover:text-[#1515F5] transition-colors">Aircraft · {ac.callSign}</a>
              <span className={`flex items-center gap-1.5 text-xs font-medium ${statusColor}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                {statusLabel}
              </span>
            </div>

            {/* Aircraft documents */}
            {ac.documents.length > 0 && (
              <div className="space-y-1">
                {ac.documents.map((doc) => {
                  const isWarning = !doc.isExpired && doc.daysRemaining <= 14;
                  return (
                    <div
                      key={doc.name}
                      className="flex items-center justify-between text-sm bg-[#F7F7F7] dark:bg-gray-800 rounded-lg px-2.5 py-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {doc.isExpired ? (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" />
                        ) : isWarning ? (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-amber-500" />
                        ) : (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-green-500" />
                        )}
                        <span className="truncate">{doc.name}</span>
                      </div>
                      <span
                        className={`text-xs shrink-0 ml-2 font-medium ${
                          doc.isExpired ? "text-red-600 dark:text-red-400"
                          : isWarning ? "text-amber-600 dark:text-amber-400"
                          : "text-e-grey"
                        }`}
                      >
                        {doc.isExpired
                          ? `Expired ${Math.abs(doc.daysRemaining)}d ago`
                          : `${doc.daysRemaining}d · ${doc.expires}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Open remarks */}
            {ac.openRemarks.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-e-grey">Open remarks ({ac.callSign} · {ac.openRemarks.length})</p>
                {ac.openRemarks.map((r) => (
                  <div
                    key={r.id}
                    className="text-sm bg-[#F7F7F7] dark:bg-gray-800 rounded-lg px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 min-w-0 truncate">{r.remark}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.isNew && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            NEW
                          </span>
                        )}
                        <span className="text-xs text-e-grey">{r.daysAgo}d ago</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Report */}
      {data.report && (
        <div className="flex gap-4 text-sm bg-[#F7F7F7] dark:bg-gray-800 rounded-lg px-3 py-2">
          {data.report.landings != null && (
            <div>
              <span className="text-e-grey text-xs">Landings</span>
              <p className="font-medium">{data.report.landings}</p>
            </div>
          )}
          {data.report.fuelLtrs != null && (
            <div>
              <span className="text-e-grey text-xs">Fuel</span>
              <p className="font-medium">{data.report.fuelLtrs} L</p>
            </div>
          )}
          {data.report.remarks && (
            <div className="flex-1 min-w-0">
              <span className="text-e-grey text-xs">Remarks</span>
              <p className="font-medium truncate">{data.report.remarks}</p>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
