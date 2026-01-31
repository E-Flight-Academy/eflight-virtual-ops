"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { DEFAULT_LABELS, type UiLabels } from "./labels";

interface I18nContextValue {
  labels: UiLabels;
  lang: string;
  t: (key: keyof UiLabels) => string;
  setTranslations: (lang: string, labels: UiLabels) => void;
  resetLanguage: () => void;
}

const I18nContext = createContext<I18nContextValue>({
  labels: DEFAULT_LABELS,
  lang: "en",
  t: (key) => DEFAULT_LABELS[key],
  setTranslations: () => {},
  resetLanguage: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [labels, setLabels] = useState<UiLabels>(DEFAULT_LABELS);
  const [lang, setLang] = useState("en");

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
  }, []);

  return (
    <I18nContext.Provider value={{ labels, lang, t, setTranslations, resetLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
