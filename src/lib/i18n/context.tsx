"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { DEFAULT_LABELS, type UiLabels } from "./labels";

interface I18nContextValue {
  labels: UiLabels;
  lang: string;
  translatedStarters: string[];
  t: (key: keyof UiLabels) => string;
  setTranslations: (lang: string, labels: UiLabels) => void;
  resetLanguage: () => void;
  switchLanguage: (lang: string) => Promise<void>;
}

const I18nContext = createContext<I18nContextValue>({
  labels: DEFAULT_LABELS,
  lang: "en",
  translatedStarters: [],
  t: (key) => DEFAULT_LABELS[key],
  setTranslations: () => {},
  resetLanguage: () => {},
  switchLanguage: async () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<UiLabels>(DEFAULT_LABELS);
  const [lang, setLang] = useState("en");
  const [translatedStarters, setTranslatedStarters] = useState<string[]>([]);

  const t = useCallback(
    (key: keyof UiLabels) => labels[key] ?? DEFAULT_LABELS[key] ?? key,
    [labels]
  );

  const setTranslations = useCallback((newLang: string, newLabels: UiLabels) => {
    setLang(newLang);
    setLabels(newLabels);
  }, []);

  const resetLanguage = useCallback(() => {
    setLang("en");
    setLabels(DEFAULT_LABELS);
    setTranslatedStarters([]);
  }, []);

  const switchLanguage = useCallback(async (newLang: string) => {
    const code = newLang.toLowerCase().slice(0, 2);

    if (code === "en") {
      setLang("en");
      setLabels(DEFAULT_LABELS);
      setTranslatedStarters([]);
      return;
    }

    // Optimistic: update lang immediately for button highlight
    setLang(code);

    try {
      const res = await fetch(`/api/i18n?lang=${code}`);
      if (res.ok) {
        const data = await res.json();
        setLabels(data.labels);
        setTranslatedStarters(data.starters);
      }
    } catch {
      // If fetch fails, lang is set but labels remain — acceptable degradation
    }
  }, []);

  return (
    <I18nContext.Provider value={{ labels, lang, translatedStarters, t, setTranslations, resetLanguage, switchLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
