"use client";

import { useState } from "react";

const STEP_LABELS: Record<string, Record<string, string[]>> = {
  config: {
    nl: ["Instellingen laden..."],
    en: ["Loading settings..."],
    de: ["Einstellungen laden..."],
  },
  faqs: {
    nl: ["Veelgestelde vragen checken...", "FAQ's doorzoeken..."],
    en: ["Checking FAQs...", "Searching FAQs..."],
    de: ["FAQ durchsuchen...", "Häufig gestellte Fragen prüfen..."],
  },
  documents: {
    nl: ["Documenten doorzoeken...", "Kennisbank raadplegen...", "Relevante documenten zoeken..."],
    en: ["Searching documents...", "Consulting knowledge base...", "Finding relevant documents..."],
    de: ["Dokumente durchsuchen...", "Wissensdatenbank konsultieren..."],
  },
  files: {
    nl: ["Bestanden analyseren...", "PDF's verwerken..."],
    en: ["Analyzing files...", "Processing PDFs..."],
    de: ["Dateien analysieren...", "PDFs verarbeiten..."],
  },
  website: {
    nl: ["Website raadplegen...", "Webpagina's doorzoeken..."],
    en: ["Consulting website...", "Searching web pages..."],
    de: ["Website konsultieren...", "Webseiten durchsuchen..."],
  },
  products: {
    nl: ["Producten ophalen...", "Aanbod bekijken..."],
    en: ["Fetching products...", "Checking products..."],
    de: ["Produkte abrufen...", "Angebot prüfen..."],
  },
  orders: {
    nl: ["Bestellingen checken...", "Bestelgeschiedenis ophalen..."],
    en: ["Checking orders...", "Fetching order history..."],
    de: ["Bestellungen prüfen...", "Bestellverlauf abrufen..."],
  },
  generating: {
    nl: ["Antwoord formuleren...", "Antwoord schrijven..."],
    en: ["Formulating response...", "Writing answer..."],
    de: ["Antwort formulieren...", "Antwort schreiben..."],
  },
};

interface TypingIndicatorProps {
  progressSteps?: string[];
  lang?: string;
}

export default function TypingIndicator({ progressSteps = [], lang = "nl" }: TypingIndicatorProps) {
  // Pick a random variant seed once so labels stay stable across re-renders
  const [seed] = useState(() => Math.random());

  function getLabel(step: string): string {
    const labels = STEP_LABELS[step]?.[lang] ?? STEP_LABELS[step]?.en ?? [step];
    const idx = Math.floor(seed * labels.length) % labels.length;
    return labels[idx];
  }

  return (
    <div className="flex items-start gap-3 max-w-4xl mx-auto w-full animate-slide-in-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 transition-transform duration-200 hover:scale-150" />
      <div className="flex flex-col gap-1.5">
        {/* Bouncing dots */}
        <div className="flex space-x-2 pt-2">
          <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce" />
          <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.1s]" />
          <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.2s]" />
        </div>

        {/* Progress steps */}
        {progressSteps.length > 0 && (
          <div className="space-y-0.5 mt-1">
            {progressSteps.map((step, i) => {
              const isLast = i === progressSteps.length - 1;
              return (
                <div
                  key={step}
                  className="flex items-center gap-1.5 text-xs text-e-grey animate-fade-in-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  {isLast ? (
                    /* Spinner for current/last step */
                    <svg className="w-3 h-3 text-e-indigo animate-spin" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    /* Checkmark for completed steps */
                    <svg className="w-3 h-3 text-emerald-500" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5l3.5 3.5 6.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  <span>{getLabel(step)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
