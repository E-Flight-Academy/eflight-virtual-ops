import { useState, useMemo, useRef, useCallback } from "react";

export function useFaqSuggestions(
  input: string,
  faqs: { question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string; category: string[]; audience: string[]; url: string }[],
  starters: { question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string }[],
  getQ: (item: { question: string; questionNl: string; questionDe: string }) => string
) {
  const [debouncedInput, setDebouncedInput] = useState(input);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSuggestionsRef = useRef<string[]>([]);

  // Debounce input changes via callback instead of effect
  const prevInputRef = useRef(input);
  if (prevInputRef.current !== input) {
    prevInputRef.current = input;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!input.trim()) {
      setDebouncedInput("");
    } else {
      timerRef.current = setTimeout(() => setDebouncedInput(input), 150);
    }
  }

  const faqSuggestions = useMemo(() => {
    const query = debouncedInput.trim().toLowerCase();
    if (query.length < 2) return [];
    // Check if input matches a starter exactly (user clicked a starter)
    if (starters.some((s) => getQ(s) === debouncedInput)) return [];
    return faqs
      .filter((f) => {
        const lower = getQ(f).toLowerCase();
        return lower.includes(query) ||
          lower.split(/\s+/).some((word) => word.startsWith(query));
      })
      .map((f) => getQ(f))
      .slice(0, 5);
  }, [debouncedInput, faqs, starters, getQ]);

  // Reset selection when suggestions change (compared by reference)
  const suggestionsChanged = prevSuggestionsRef.current !== faqSuggestions;
  if (suggestionsChanged) {
    prevSuggestionsRef.current = faqSuggestions;
  }

  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);

  const setSelectedSuggestionWrapped = useCallback((v: number | ((prev: number) => number)) => {
    setSelectedSuggestion(v);
  }, []);

  // Reset selection during render when suggestions change
  if (suggestionsChanged && selectedSuggestion !== -1) {
    setSelectedSuggestion(-1);
  }

  return { faqSuggestions, selectedSuggestion, setSelectedSuggestion: setSelectedSuggestionWrapped };
}
