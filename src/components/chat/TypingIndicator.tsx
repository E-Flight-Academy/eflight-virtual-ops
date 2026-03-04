"use client";

import { useState } from "react";

const STEP_LABELS: Record<string, Record<string, string[]>> = {
  config: {
    nl: ["Instellingen laden"],
    en: ["Loading settings"],
    de: ["Einstellungen laden"],
  },
  faqs: {
    nl: ["Veelgestelde vragen checken", "FAQ's doorzoeken"],
    en: ["Checking FAQs", "Searching FAQs"],
    de: ["FAQ durchsuchen", "Häufig gestellte Fragen prüfen"],
  },
  documents: {
    nl: ["Documenten doorzoeken", "Kennisbank raadplegen", "Relevante documenten zoeken"],
    en: ["Searching documents", "Consulting knowledge base", "Finding relevant documents"],
    de: ["Dokumente durchsuchen", "Wissensdatenbank konsultieren"],
  },
  files: {
    nl: ["Bestanden analyseren", "PDF's verwerken"],
    en: ["Analyzing files", "Processing PDFs"],
    de: ["Dateien analysieren", "PDFs verarbeiten"],
  },
  website: {
    nl: ["Website raadplegen", "Webpagina's doorzoeken"],
    en: ["Consulting website", "Searching web pages"],
    de: ["Website konsultieren", "Webseiten durchsuchen"],
  },
  products: {
    nl: ["Producten ophalen", "Aanbod bekijken"],
    en: ["Fetching products", "Checking products"],
    de: ["Produkte abrufen", "Angebot prüfen"],
  },
  orders: {
    nl: ["Bestellingen checken", "Bestelgeschiedenis ophalen"],
    en: ["Checking orders", "Fetching order history"],
    de: ["Bestellungen prüfen", "Bestellverlauf abrufen"],
  },
  generating: {
    nl: ["Antwoord formuleren", "Antwoord schrijven"],
    en: ["Formulating response", "Writing answer"],
    de: ["Antwort formulieren", "Antwort schreiben"],
  },
};

interface TypingIndicatorProps {
  progressSteps?: string[];
  lang?: string;
}

export default function TypingIndicator({ progressSteps = [], lang = "nl" }: TypingIndicatorProps) {
  const [seed] = useState(() => Math.random());

  function getLabel(step: string): string {
    const labels = STEP_LABELS[step]?.[lang] ?? STEP_LABELS[step]?.en ?? [step];
    const idx = Math.floor(seed * labels.length) % labels.length;
    return labels[idx];
  }

  const completed = progressSteps.slice(0, -1);
  const current = progressSteps.length > 0 ? progressSteps[progressSteps.length - 1] : null;

  return (
    <div className="flex items-start gap-3 max-w-4xl mx-auto w-full animate-slide-in-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 transition-transform duration-200 hover:scale-150" />
      <div className="max-w-[85%]">
        <div className="bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-tl-sm">
          {/* Bouncing dots */}
          <div className="flex space-x-2 h-5 items-center">
            <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.1s]" />
            <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.2s]" />
          </div>

          {/* Progress steps */}
          {progressSteps.length > 0 && (
            <div className="mt-2 text-sm leading-relaxed text-e-grey">
              {/* Completed steps — inline, separated by middot */}
              {completed.length > 0 && (
                <span className="animate-fade-in-up">
                  {completed.map((step, i) => (
                    <span key={step}>
                      <svg className="w-3 h-3 text-emerald-500 inline-block -mt-0.5 mr-0.5" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8.5l3.5 3.5 6.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-e-grey-light">{getLabel(step)}</span>
                      {i < completed.length - 1 && <span className="mx-1.5 text-e-grey-light">&middot;</span>}
                    </span>
                  ))}
                </span>
              )}

              {/* Current step — on its own line */}
              {current && (
                <div className="flex items-center gap-1.5 mt-1 animate-fade-in-up">
                  <svg className="w-3 h-3 text-e-indigo animate-spin shrink-0" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                    <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>{getLabel(current)}...</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
