"use client";

import { useState } from "react";
import type { ScheduleDay } from "@/types/chat";
import SegmentedController from "./SegmentedController";

interface ScheduleMessageProps {
  data: ScheduleDay[];
  summary: string;
  onBookingClick?: (bookingId: number, date: string, time: string, student: string) => void;
}

type Tab = "upcoming" | "today" | "past";

export default function ScheduleMessage({ data, summary, onBookingClick }: ScheduleMessageProps) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const currentTime = now.toTimeString().slice(0, 5);

  const pastDays = data.filter((d) => d.date < today);
  const todayDays = data.filter((d) => d.date === today);
  const upcomingDays = data.filter((d) => d.date > today);

  const defaultTab: Tab = upcomingDays.length > 0 ? "upcoming" : todayDays.length > 0 ? "today" : "past";
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  const [showAllDays, setShowAllDays] = useState(false);
  const MAX_DAYS_COLLAPSED = 2;

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "upcoming", label: "Upcoming", count: upcomingDays.reduce((s, d) => s + d.bookings.length, 0) },
    { key: "today", label: "Today", count: todayDays.reduce((s, d) => s + d.bookings.length, 0) },
    { key: "past", label: "Past", count: pastDays.reduce((s, d) => s + d.bookings.length, 0) },
  ];

  const activeDays = activeTab === "upcoming" ? upcomingDays : activeTab === "today" ? todayDays : pastDays;

  const isBookingPast = (day: ScheduleDay, timeFrom: string) => {
    if (day.date === today && timeFrom <= currentTime) return true;
    return false;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-e-grey">{summary}</p>

      {/* Segmented controller */}
      <SegmentedController
        tabs={tabs.map((t) => ({ key: t.key, label: t.label, count: t.count }))}
        activeKey={activeTab}
        onSelect={(key) => setActiveTab(key as Tab)}
      />

      {/* Day cards — render all tabs in a grid so width is stable, height adapts */}
      <div className="grid">
        {(["upcoming", "today", "past"] as Tab[]).map((tabKey) => {
          const days = tabKey === "upcoming" ? upcomingDays : tabKey === "today" ? todayDays : pastDays;
          const visible = activeTab === tabKey;
          return (
            <div
              key={tabKey}
              className={`col-start-1 row-start-1 space-y-3 ${visible ? "" : "h-0 overflow-hidden invisible"}`}
              aria-hidden={!visible}
            >
              {days.length === 0 ? (
                <p className="text-sm text-e-grey text-center py-3">
                  {tabKey === "upcoming" ? "No upcoming lessons" : tabKey === "today" ? "No lessons today" : "No past lessons"}
                </p>
              ) : (<>
                {(showAllDays ? days : days.slice(0, MAX_DAYS_COLLAPSED)).map((day) => (
                  <div
                    key={day.date}
                    className={`rounded-xl border px-3 py-2 ${
                      day.date === today
                        ? "border-[#1515F5]/30 bg-[#F0F0FF] dark:bg-[#1515F5]/10"
                        : "border-[#ECECEC] bg-white dark:bg-gray-900"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <a
                        href={day.wingsLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-foreground hover:text-[#1515F5] transition-colors flex items-center gap-1.5"
                      >
                        {formatDate(day.date)}
                        {day.date === today && (
                          <span className="text-[10px] font-medium bg-[#1515F5] text-white px-1.5 py-0.5 rounded-full">
                            TODAY
                          </span>
                        )}
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                      <span className="text-xs text-e-grey">
                        {day.bookings.length} booking{day.bookings.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {day.bookings.map((b) => {
                        const past = isBookingPast(day, b.timeFrom);
                        const planLabel = b.lessonPlan
                          ? (b.lessonPlan.length > 20 ? b.lessonPlan.slice(0, 20) + "…" : b.lessonPlan)
                          : null;
                        return (
                          <button
                            key={b.id}
                            onClick={() => onBookingClick?.(b.id, day.date, b.timeFrom, b.studentFull)}
                            className={`flex items-center gap-2 text-sm py-1.5 border-t border-[#F2F2F2] dark:border-gray-700 first:border-t-0 rounded-md -mx-1.5 px-1.5 transition-colors hover:bg-[#F2F2F2] dark:hover:bg-gray-800 cursor-pointer w-full text-left ${
                              past ? "opacity-40" : ""
                            }`}
                          >
                            <span
                              className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                                b.status === "Confirmed" ? "bg-green-500" :
                                b.status === "Declined" ? "bg-red-400" :
                                "bg-[#ABABAB]"
                              }`}
                              title={b.status}
                            />
                            <span className="font-mono text-xs text-e-grey shrink-0 w-[90px]">
                              {b.timeFrom}–{b.timeTo}
                            </span>
                            <span className="truncate flex-1 font-medium">{b.studentFull}</span>
                            {planLabel && (
                              <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 max-w-[140px] truncate ${
                                b.isAssessment
                                  ? "bg-[#ECD3F4] text-[#7B2D8E] dark:bg-[#7B2D8E]/20 dark:text-[#DFB6EE]"
                                  : "bg-[#F2F2F2] dark:bg-gray-700 text-e-grey"
                              }`}>
                                {planLabel}
                              </span>
                            )}
                            {b.lessonStatus && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
                                b.lessonStatus === "Complete"
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  : b.lessonStatus === "In Progress"
                                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                  : b.lessonStatus === "Accepted"
                                  ? "bg-[#DAF4EC] text-[#1B7A54] dark:bg-[#1B7A54]/20 dark:text-[#85D9BF]"
                                  : b.lessonStatus === "Prepare"
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-[#F2F2F2] text-e-grey dark:bg-gray-700"
                              }`}>
                                {b.lessonStatus}
                              </span>
                            )}
                            {b.aircraft !== "—" && (
                              <span className="text-xs bg-[#F2F2F2] dark:bg-gray-700 px-1.5 py-0.5 rounded text-e-grey shrink-0">
                                {b.aircraft}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {days.length > MAX_DAYS_COLLAPSED && (
                  <button
                    onClick={() => setShowAllDays(!showAllDays)}
                    className="flex items-center gap-1.5 text-xs text-e-grey hover:text-[#1515F5] transition-colors cursor-pointer mx-auto"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points={showAllDays ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
                    </svg>
                    {showAllDays ? "Show less" : `Show ${days.length - MAX_DAYS_COLLAPSED} more day${days.length - MAX_DAYS_COLLAPSED !== 1 ? "s" : ""}`}
                  </button>
                )}
              </>)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
