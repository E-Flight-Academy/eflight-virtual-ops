"use client";

import { useState } from "react";
import type { DocValidityData, DocumentValidity } from "@/types/chat";
import SegmentedController from "./SegmentedController";

interface DocumentValidityMessageProps {
  data: DocValidityData;
  summary: string;
}

type Filter = "all" | "attention" | "valid";

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

function statusColor(doc: DocumentValidity) {
  if (doc.isExpired) return "bg-red-500";
  if (doc.daysRemaining <= 30) return "bg-amber-500";
  return "bg-green-500";
}

function DocRow({ doc }: { doc: DocumentValidity }) {
  return (
    <div className={`flex items-center gap-2 py-2 px-3 rounded-lg ${
      doc.isExpired
        ? "bg-red-50 dark:bg-red-900/10"
        : doc.daysRemaining <= 30
          ? "bg-amber-50 dark:bg-amber-900/10"
          : ""
    }`}>
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor(doc)}`} />
      <span className="text-sm font-medium text-foreground truncate">{doc.name}</span>
      <span className="ml-auto text-xs text-e-grey whitespace-nowrap tabular-nums">
        {doc.isExpired ? `-${Math.abs(doc.daysRemaining)}d` : `${doc.daysRemaining}d`} · {formatDate(doc.expires)}
      </span>
    </div>
  );
}

export default function DocumentValidityMessage({ data, summary }: DocumentValidityMessageProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const expired = data.documents.filter((d) => d.isExpired);
  const expiringSoon = data.documents.filter((d) => !d.isExpired && d.daysRemaining <= 30);
  const attention = [...expired, ...expiringSoon];
  const valid = data.documents.filter((d) => !d.isExpired && d.daysRemaining > 30);

  if (data.documents.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-[#ECECEC] dark:border-gray-700 p-4">
        <div className="text-sm text-e-grey">No documents with expiry dates found for {data.userName}.</div>
      </div>
    );
  }

  const tabs = [
    { key: "all" as Filter, label: "All", count: data.documents.length },
    { key: "attention" as Filter, label: "Attention", count: attention.length },
    { key: "valid" as Filter, label: "Valid", count: valid.length },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-[#ECECEC] dark:border-gray-700 overflow-hidden">
      <div className="px-4 pt-3 pb-2">
        <a href={`https://eflight.oywings.com/students?search=${encodeURIComponent(data.userName)}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-foreground hover:text-[#1515F5] transition-colors">{data.userName}</a>
        <div className="text-xs font-medium text-e-grey">{summary}</div>
        {data.documents.length > 3 && (
          <SegmentedController
            tabs={tabs}
            activeKey={filter}
            onSelect={(key) => setFilter(key as Filter)}
          />
        )}
      </div>

      {/* Grid technique: all panels occupy same cell so width stays stable */}
      <div className="grid px-3 pb-3">
        {(["all", "attention", "valid"] as Filter[]).map((tab) => {
          const docs = tab === "attention" ? attention : tab === "valid" ? valid : data.documents;
          const isActive = filter === tab;
          return (
            <div
              key={tab}
              className={`col-start-1 row-start-1 space-y-1 ${isActive ? "" : "h-0 overflow-hidden invisible"}`}
            >
              {docs.length === 0 ? (
                <div className="text-sm text-e-grey py-2 px-3">
                  {tab === "attention" ? "No documents need attention." : tab === "valid" ? "No valid documents." : "No documents found."}
                </div>
              ) : (
                docs.map((doc, i) => <DocRow key={`${doc.name}-${i}`} doc={doc} />)
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
