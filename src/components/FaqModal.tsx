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

// Category color mapping
const categoryColors: Record<string, { dot: string; text: string; bg: string }> = {
  "Teuge Airport": { dot: "bg-blue-500", text: "text-blue-700", bg: "bg-blue-50" },
  "Training": { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50" },
  "Aircraft": { dot: "bg-purple-500", text: "text-purple-700", bg: "bg-purple-50" },
  "Pricing": { dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50" },
  "Charging": { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50" },
};

const getColorForCategory = (cat: string) => {
  return categoryColors[cat] || { dot: "bg-gray-500", text: "text-gray-700", bg: "bg-gray-50" };
};

export default function FaqModal({ faqs, lang, onClose, onSelectFaq }: FaqModalProps) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAudience, setSelectedAudience] = useState<string | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);

  const getQ = (faq: Faq) => {
    if (lang === "nl" && faq.questionNl) return faq.questionNl;
    if (lang === "de" && faq.questionDe) return faq.questionDe;
    return faq.question;
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
      const matchesSearch = !q || question.includes(q);
      const matchesCategory = !selectedCategory || faq.category === selectedCategory;
      const matchesAudience = !selectedAudience || faq.audience.includes(selectedAudience);
      return matchesSearch && matchesCategory && matchesAudience;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faqs, search, selectedCategory, selectedAudience, lang]);

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
            className="bg-transparent hover:bg-[#F7F7F7] text-[#1A1A1A] rounded-full h-10 w-10 p-0 flex items-center justify-center transition-colors cursor-pointer"
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
          <div className="px-6 py-3 border-b border-[#ECECEC]">
            <div className="flex gap-3">
              {/* Category dropdown */}
              {categories.length > 0 && (
                <div className="relative flex-1">
                  <button
                    onClick={() => { setCategoryOpen(!categoryOpen); setAudienceOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#ECECEC] border border-[#ECECEC] cursor-pointer"
                  >
                    <span className="truncate">{selectedCategory || "All topics"}</span>
                    <svg
                      className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${categoryOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {categoryOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setCategoryOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 w-full bg-white border border-[#ECECEC] rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                        <button
                          onClick={() => { setSelectedCategory(null); setCategoryOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer first:rounded-t-xl last:rounded-b-xl ${
                            selectedCategory === null
                              ? "bg-[#1515F5] text-white"
                              : "text-[#1A1A1A] hover:bg-[#F7F7F7]"
                          }`}
                        >
                          All topics
                        </button>
                        {categories.map((cat) => {
                          const colors = getColorForCategory(cat);
                          return (
                            <button
                              key={cat}
                              onClick={() => { setSelectedCategory(cat); setCategoryOpen(false); }}
                              className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer flex items-center gap-2 first:rounded-t-xl last:rounded-b-xl ${
                                selectedCategory === cat
                                  ? "bg-[#1515F5] text-white"
                                  : "text-[#1A1A1A] hover:bg-[#F7F7F7]"
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${selectedCategory === cat ? "bg-white" : colors.dot}`} />
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Audience dropdown */}
              {audiences.length > 0 && (
                <div className="relative flex-1">
                  <button
                    onClick={() => { setAudienceOpen(!audienceOpen); setCategoryOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors bg-[#F7F7F7] text-[#1A1A1A] hover:bg-[#ECECEC] border border-[#ECECEC] cursor-pointer"
                  >
                    <span className="truncate">{selectedAudience || "Everybody"}</span>
                    <svg
                      className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform ${audienceOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {audienceOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setAudienceOpen(false)} />
                      <div className="absolute left-0 top-full mt-1 w-full bg-white border border-[#ECECEC] rounded-xl shadow-lg z-20 max-h-60 overflow-y-auto">
                        <button
                          onClick={() => { setSelectedAudience(null); setAudienceOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer first:rounded-t-xl last:rounded-b-xl ${
                            selectedAudience === null
                              ? "bg-[#1515F5] text-white"
                              : "text-[#1A1A1A] hover:bg-[#F7F7F7]"
                          }`}
                        >
                          Everybody
                        </button>
                        {audiences.map((aud) => (
                          <button
                            key={aud}
                            onClick={() => { setSelectedAudience(aud); setAudienceOpen(false); }}
                            className={`w-full text-left px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer first:rounded-t-xl last:rounded-b-xl ${
                              selectedAudience === aud
                                ? "bg-[#1515F5] text-white"
                                : "text-[#1A1A1A] hover:bg-[#F7F7F7]"
                            }`}
                          >
                            {aud}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* FAQ List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-[#ABABAB] mb-4">No matching questions found</p>
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-full bg-[#1515F5] text-white font-medium hover:bg-[#1212D0] transition-colors cursor-pointer"
              >
                Ask Steward!
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((faq, i) => {
                const colors = getColorForCategory(faq.category);
                return (
                  <button
                    key={i}
                    onClick={() => onSelectFaq(getQ(faq))}
                    className="w-full text-left rounded-lg p-3 transition-all group hover:shadow-md bg-[#F7F7F7] hover:bg-[#ECECEC] cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-[#1A1A1A] text-sm group-hover:text-[#1515F5] transition-colors flex-1">
                        {getQ(faq)}
                      </p>
                      <div className="flex gap-1.5 items-center flex-shrink-0">
                        {faq.category && (
                          <span className={`text-xs font-medium px-2 py-1 rounded-md ${colors.text} bg-white/60`}>
                            {faq.category}
                          </span>
                        )}
                        {faq.audience.length > 0 && faq.audience[0] && (
                          <span className="text-xs font-medium text-[#6B6B6B] bg-white/60 px-2 py-1 rounded-md">
                            {faq.audience[0]}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
