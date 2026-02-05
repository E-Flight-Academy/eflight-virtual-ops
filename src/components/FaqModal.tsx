"use client";

import { useMemo, useState } from "react";

interface Faq {
  question: string;
  questionNl: string;
  questionDe: string;
  answer: string;
  answerNl: string;
  answerDe: string;
  category: string;
  audience: string[];
}

interface FaqModalProps {
  faqs: Faq[];
  lang: string;
  onClose: () => void;
  onSelectFaq: (question: string) => void;
}

export default function FaqModal({ faqs, lang, onClose, onSelectFaq }: FaqModalProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null);

  const getQ = (faq: Faq) => {
    if (lang === "nl" && faq.questionNl) return faq.questionNl;
    if (lang === "de" && faq.questionDe) return faq.questionDe;
    return faq.question;
  };

  const getA = (faq: Faq) => {
    if (lang === "nl" && faq.answerNl) return faq.answerNl;
    if (lang === "de" && faq.answerDe) return faq.answerDe;
    return faq.answer;
  };

  const categories = useMemo(() => {
    const cats = faqs.map((f) => f.category).filter(Boolean);
    return [...new Set(cats)].sort();
  }, [faqs]);

  const audiences = useMemo(() => {
    const auds = faqs.flatMap((f) => f.audience).filter(Boolean);
    return [...new Set(auds)].sort();
  }, [faqs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return faqs.filter((faq) => {
      const question = getQ(faq).toLowerCase();
      const answer = getA(faq).toLowerCase();
      const matchesSearch = !q || question.includes(q) || answer.includes(q);
      const matchesCategory = !selectedCategory || faq.category === selectedCategory;
      const matchesAudience = !selectedAudience || faq.audience.includes(selectedAudience);
      return matchesSearch && matchesCategory && matchesAudience;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faqs, search, selectedCategory, selectedAudience, lang]);

  // Strip markdown for preview text
  const stripMd = (text: string) =>
    text.replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/~~(.+?)~~/g, "$1")
      .replace(/`(.+?)`/g, "$1")
      .replace(/^- /gm, "")
      .replace(/\n+/g, " ")
      .trim();

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-[5vh] px-4 pb-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECECEC]">
          <h2 className="text-2xl font-semibold text-[#1A1A1A]">Frequently Asked Questions</h2>
          <button
            onClick={onClose}
            className="bg-transparent hover:bg-[#F7F7F7] text-[#1A1A1A] rounded-full h-10 w-10 p-0 flex items-center justify-center transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-[#ECECEC]">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#ABABAB]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#F7F7F7] border border-[#ECECEC] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1515F5] focus:border-transparent placeholder:text-[#ABABAB]"
            />
          </div>
        </div>

        {/* Filters */}
        {(categories.length > 0 || audiences.length > 0) && (
          <div className="px-6 py-4 border-b border-[#ECECEC]">
            {categories.length > 0 && (
              <div className="mb-3 flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === null
                      ? "bg-[#1515F5] text-white"
                      : "bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#ECECEC]"
                  }`}
                >
                  All topics
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedCategory === cat
                        ? "bg-[#1515F5] text-white"
                        : "bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#ECECEC]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
            {audiences.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setSelectedAudience(null)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedAudience === null
                      ? "bg-[#1515F5] text-white"
                      : "bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#ECECEC]"
                  }`}
                >
                  Everybody
                </button>
                {audiences.filter((a) => a !== "Everybody").map((aud) => (
                  <button
                    key={aud}
                    onClick={() => setSelectedAudience(selectedAudience === aud ? null : aud)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedAudience === aud
                        ? "bg-[#1515F5] text-white"
                        : "bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#ECECEC]"
                    }`}
                  >
                    {aud}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* FAQ List */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-[#ABABAB]">
              No matching questions found
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((faq, i) => (
                <button
                  key={i}
                  onClick={() => onSelectFaq(getQ(faq))}
                  className="w-full text-left bg-[#F7F7F7] hover:bg-[#ECECEC] rounded-2xl p-4 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#1A1A1A] mb-1 group-hover:text-[#1515F5] transition-colors">
                        {getQ(faq)}
                      </p>
                      <p className="text-sm text-[#6B6B6B] line-clamp-2">
                        {stripMd(getA(faq))}
                      </p>
                    </div>
                    {faq.category && (
                      <span className="text-xs font-medium text-[#1515F5] bg-[#1515F5]/10 px-2 py-1 rounded-full whitespace-nowrap">
                        {faq.category}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
