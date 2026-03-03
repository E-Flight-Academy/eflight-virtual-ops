import { useState, useCallback, useRef } from "react";
import type { KvFaq } from "@/lib/kv-cache";

export type FaqAdminPhase =
  | "idle"
  | "choose-action"
  | "choose-faq"
  | "drafting-question"
  | "drafting-answer"
  | "choose-category"
  | "choose-audience"
  | "choose-link"
  | "drafting-link"
  | "translating"
  | "preview"
  | "revise"
  | "applying"
  | "done";

export type FaqAdminAction = "add" | "edit" | "delete";

export interface FaqTranslations {
  question_en: string;
  answer_en: string;
  question_nl: string;
  answer_nl: string;
  question_de: string;
  answer_de: string;
}

interface UseFaqAdminOptions {
  faqs: KvFaq[];
  setFaqs: (faqs: KvFaq[]) => void;
  setMessages: React.Dispatch<React.SetStateAction<{ role: "user" | "assistant"; content: string; logId?: string; rating?: "\u{1F44D}" | "\u{1F44E}" }[]>>;
  lang: string;
}

export function useFaqAdmin({ faqs, setFaqs, setMessages, lang }: UseFaqAdminOptions) {
  const [phase, setPhase] = useState<FaqAdminPhase>("idle");
  const [action, setAction] = useState<FaqAdminAction | null>(null);
  const [selectedFaq, setSelectedFaq] = useState<KvFaq | null>(null);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [draftAnswer, setDraftAnswer] = useState("");
  const [draftCategory, setDraftCategory] = useState("");
  const [draftAudience, setDraftAudience] = useState<string[]>([]);
  const [draftUrl, setDraftUrl] = useState("");
  const [translations, setTranslations] = useState<FaqTranslations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisingField, setRevisingField] = useState<string | null>(null);

  // Refs for accessing latest values in callbacks without stale closures
  const draftCategoryRef = useRef(draftCategory);
  draftCategoryRef.current = draftCategory;
  const draftAudienceRef = useRef(draftAudience);
  draftAudienceRef.current = draftAudience;
  const draftUrlRef = useRef(draftUrl);
  draftUrlRef.current = draftUrl;
  const translationsRef = useRef(translations);
  translationsRef.current = translations;

  const reset = useCallback(() => {
    setPhase("idle");
    setAction(null);
    setSelectedFaq(null);
    setDraftQuestion("");
    setDraftAnswer("");
    setDraftCategory("");
    setDraftAudience([]);
    setDraftUrl("");
    setTranslations(null);
    setError(null);
    setRevisingField(null);
  }, []);

  const categories = [...new Set(faqs.map((f) => f.category).filter(Boolean))];
  const audiences = [...new Set(faqs.flatMap((f) => f.audience || []).filter(Boolean))];

  const buildMetaString = useCallback((cat: string, aud: string[], url: string) => {
    return [
      cat ? `**${lang === "nl" ? "Categorie" : lang === "de" ? "Kategorie" : "Category"}:** ${cat}` : "",
      aud.length > 0 ? `**${lang === "nl" ? "Doelgroep" : lang === "de" ? "Zielgruppe" : "Audience"}:** ${aud.join(", ")}` : "",
      url ? `**Link:** ${url}` : "",
    ].filter(Boolean).join("\n");
  }, [lang]);

  const showPreview = useCallback((trans: FaqTranslations, cat: string, aud: string[], url: string) => {
    setPhase("preview");
    const meta = buildMetaString(cat, aud, url);
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content:
        (lang === "nl" ? "**Preview in 3 talen:**\n\n" : lang === "de" ? "**Vorschau in 3 Sprachen:**\n\n" : "**Preview in 3 languages:**\n\n") +
        `🇬🇧 **EN**\n**Q:** ${trans.question_en}\n**A:** ${trans.answer_en}\n\n` +
        `🇳🇱 **NL**\n**Q:** ${trans.question_nl}\n**A:** ${trans.answer_nl}\n\n` +
        `🇩🇪 **DE**\n**Q:** ${trans.question_de}\n**A:** ${trans.answer_de}` +
        (meta ? `\n\n---\n${meta}` : "") },
    ]);
  }, [buildMetaString, setMessages, lang]);

  const startAdmin = useCallback(() => {
    setPhase("choose-action");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "Wat wil je doen met de FAQs?"
        : lang === "de"
        ? "Was möchtest du mit den FAQs machen?"
        : "What would you like to do with the FAQs?" },
    ]);
  }, [setMessages, lang]);

  const chooseAction = useCallback((a: FaqAdminAction) => {
    setAction(a);
    if (a === "add") {
      setPhase("drafting-question");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: lang === "nl"
          ? "Wat is de vraag? (je mag in elke taal schrijven)"
          : lang === "de"
          ? "Was ist die Frage? (du kannst in jeder Sprache schreiben)"
          : "What is the question? (you can write in any language)" },
      ]);
    } else if (a === "edit" || a === "delete") {
      setPhase("choose-faq");
      const faqList = faqs
        .map((f, i) => `${i + 1}. ${f.question}`)
        .join("\n");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: (lang === "nl"
          ? "Kies een FAQ door het nummer te typen:\n\n"
          : lang === "de"
          ? "Wähle eine FAQ durch Eingabe der Nummer:\n\n"
          : "Choose a FAQ by typing the number:\n\n") + faqList },
      ]);
    }
  }, [faqs, setMessages, lang]);

  const chooseFaq = useCallback((index: number) => {
    const faq = faqs[index];
    if (!faq) {
      setError("Invalid FAQ number");
      return;
    }
    setSelectedFaq(faq);

    if (action === "delete") {
      setPhase("preview");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: (lang === "nl"
          ? `Weet je zeker dat je deze FAQ wilt verwijderen?\n\n**${faq.question}**`
          : lang === "de"
          ? `Möchtest du diese FAQ wirklich löschen?\n\n**${faq.question}**`
          : `Are you sure you want to delete this FAQ?\n\n**${faq.question}**`) },
      ]);
    } else if (action === "edit") {
      setPhase("drafting-question");
      const getQ = lang === "nl" && faq.questionNl ? faq.questionNl : lang === "de" && faq.questionDe ? faq.questionDe : faq.question;
      const getA = lang === "nl" && faq.answerNl ? faq.answerNl : lang === "de" && faq.answerDe ? faq.answerDe : faq.answer;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: (lang === "nl"
          ? "Huidige FAQ:\n\n"
          : lang === "de"
          ? "Aktuelle FAQ:\n\n"
          : "Current FAQ:\n\n") +
          `**Q:** ${getQ}\n\n**A:** ${getA}\n\n` +
          (faq.category ? `**${lang === "nl" ? "Categorie" : lang === "de" ? "Kategorie" : "Category"}:** ${faq.category}\n` : "") +
          (faq.audience?.length ? `**${lang === "nl" ? "Doelgroep" : lang === "de" ? "Zielgruppe" : "Audience"}:** ${faq.audience.join(", ")}\n` : "") +
          (faq.url ? `**Link:** ${faq.url}\n` : "") +
          "\n" +
          (lang === "nl"
            ? "Wat wordt de nieuwe vraag? (of typ 'ok' om de huidige te behouden)"
            : lang === "de"
            ? "Was wird die neue Frage? (oder tippe 'ok' um die aktuelle zu behalten)"
            : "What should the new question be? (or type 'ok' to keep the current one)") },
      ]);
    }
  }, [faqs, action, setMessages, lang]);

  const showCategoryPicker = useCallback(() => {
    setPhase("choose-category");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "In welke categorie valt deze FAQ?"
        : lang === "de"
        ? "In welche Kategorie fällt diese FAQ?"
        : "Which category does this FAQ belong to?" },
    ]);
  }, [setMessages, lang]);

  const showAudiencePicker = useCallback(() => {
    setPhase("choose-audience");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "Wat is de doelgroep? (kies één of typ meerdere, gescheiden door komma's)"
        : lang === "de"
        ? "Was ist die Zielgruppe? (wähle eine oder tippe mehrere, durch Kommas getrennt)"
        : "What is the audience? (choose one or type multiple, separated by commas)" },
    ]);
  }, [setMessages, lang]);

  const showLinkChoice = useCallback(() => {
    setPhase("choose-link");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "Wil je een link toevoegen aan deze FAQ?"
        : lang === "de"
        ? "Möchtest du einen Link zu dieser FAQ hinzufügen?"
        : "Do you want to add a link to this FAQ?" },
    ]);
  }, [setMessages, lang]);

  const translateDraft = useCallback(async (question: string, answer: string, sourceLang: string) => {
    setPhase("translating");
    setError(null);

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "Even vertalen naar 3 talen..."
        : lang === "de"
        ? "Wird in 3 Sprachen übersetzt..."
        : "Translating to 3 languages..." },
    ]);

    try {
      const res = await fetch("/api/faq-admin/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer, sourceLang }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Translation failed");
      }

      const result = await res.json() as FaqTranslations;
      setTranslations(result);

      // Use refs to get latest draft values
      showPreview(result, draftCategoryRef.current, draftAudienceRef.current, draftUrlRef.current);

      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Translation failed");
      setPhase("drafting-answer");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: lang === "nl"
          ? "Vertaling mislukt. Probeer het opnieuw — geef het antwoord nogmaals."
          : lang === "de"
          ? "Übersetzung fehlgeschlagen. Bitte versuche es erneut — gib die Antwort nochmals ein."
          : "Translation failed. Please try again — provide the answer once more." },
      ]);
      return null;
    }
  }, [setMessages, lang, showPreview]);

  const apply = useCallback(async () => {
    setPhase("applying");
    setError(null);

    try {
      let body: Record<string, unknown>;

      if (action === "delete" && selectedFaq?.notionPageId) {
        body = { action: "delete", notionPageId: selectedFaq.notionPageId };
      } else if (action === "edit" && selectedFaq?.notionPageId && translations) {
        body = {
          action: "edit",
          notionPageId: selectedFaq.notionPageId,
          question: translations.question_en,
          questionNl: translations.question_nl,
          questionDe: translations.question_de,
          answer: translations.answer_en,
          answerNl: translations.answer_nl,
          answerDe: translations.answer_de,
          category: draftCategory || selectedFaq.category,
          audience: draftAudience.length > 0 ? draftAudience : selectedFaq.audience,
          url: draftUrl || selectedFaq.url,
        };
      } else if (action === "add" && translations) {
        body = {
          action: "add",
          question: translations.question_en,
          questionNl: translations.question_nl,
          questionDe: translations.question_de,
          answer: translations.answer_en,
          answerNl: translations.answer_nl,
          answerDe: translations.answer_de,
          category: draftCategory,
          audience: draftAudience,
          url: draftUrl,
        };
      } else {
        throw new Error("Invalid state");
      }

      const res = await fetch("/api/faq-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Operation failed");
      }

      const result = await res.json();

      const faqRes = await fetch("/api/faqs?fresh=true");
      if (faqRes.ok) {
        const updatedFaqs = await faqRes.json();
        setFaqs(updatedFaqs);
      }

      setPhase("done");

      const actionLabel = action === "add"
        ? (lang === "nl" ? "toegevoegd" : lang === "de" ? "hinzugefügt" : "added")
        : action === "edit"
        ? (lang === "nl" ? "bijgewerkt" : lang === "de" ? "aktualisiert" : "updated")
        : (lang === "nl" ? "verwijderd" : lang === "de" ? "gelöscht" : "deleted");

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: lang === "nl"
          ? `FAQ succesvol ${actionLabel}! ✓\n\n${result.question ? `**${result.question}**` : ""}`
          : lang === "de"
          ? `FAQ erfolgreich ${actionLabel}! ✓\n\n${result.question ? `**${result.question}**` : ""}`
          : `FAQ successfully ${actionLabel}! ✓\n\n${result.question ? `**${result.question}**` : ""}` },
      ]);

      setTimeout(() => reset(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operation failed");
      setPhase("preview");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: lang === "nl"
          ? "Operatie mislukt. Probeer het opnieuw."
          : lang === "de"
          ? "Vorgang fehlgeschlagen. Bitte versuche es erneut."
          : "Operation failed. Please try again." },
      ]);
    }
  }, [action, selectedFaq, translations, draftCategory, draftAudience, draftUrl, setFaqs, setMessages, lang, reset]);

  const cancel = useCallback(() => {
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "FAQ bewerking geannuleerd."
        : lang === "de"
        ? "FAQ-Bearbeitung abgebrochen."
        : "FAQ editing cancelled." },
    ]);
    reset();
  }, [setMessages, lang, reset]);

  const revise = useCallback(() => {
    setPhase("revise");
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: lang === "nl"
        ? "Wat wil je aanpassen?"
        : lang === "de"
        ? "Was möchtest du ändern?"
        : "What would you like to change?" },
    ]);
  }, [setMessages, lang]);

  const handleAdminInput = useCallback((text: string): boolean => {
    if (phase === "idle") return false;

    if (phase === "choose-faq") {
      const num = parseInt(text.trim(), 10);
      if (isNaN(num) || num < 1 || num > faqs.length) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: text },
          { role: "assistant", content: lang === "nl"
            ? `Ongeldig nummer. Kies een nummer tussen 1 en ${faqs.length}.`
            : lang === "de"
            ? `Ungültige Nummer. Wähle eine Nummer zwischen 1 und ${faqs.length}.`
            : `Invalid number. Choose a number between 1 and ${faqs.length}.` },
        ]);
        return true;
      }
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      chooseFaq(num - 1);
      return true;
    }

    if (phase === "drafting-question") {
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      let question: string;
      if (action === "edit" && selectedFaq && text.trim().toLowerCase() === "ok") {
        question = selectedFaq.question;
      } else {
        question = text.trim();
      }
      setDraftQuestion(question);

      // If revising only question, go straight to re-translate
      if (revisingField === "question") {
        setRevisingField(null);
        const answer = draftAnswer || (selectedFaq?.answer ?? "");
        const sourceLang = detectLanguage(question + " " + answer);
        translateDraft(question, answer, sourceLang);
        return true;
      }

      setPhase("drafting-answer");
      if (action === "edit" && selectedFaq) {
        const getA = lang === "nl" && selectedFaq.answerNl ? selectedFaq.answerNl : lang === "de" && selectedFaq.answerDe ? selectedFaq.answerDe : selectedFaq.answer;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? `Wat wordt het nieuwe antwoord? (of typ 'ok' om het huidige te behouden)\n\nHuidig antwoord:\n${getA}`
            : lang === "de"
            ? `Was wird die neue Antwort? (oder tippe 'ok' um die aktuelle zu behalten)\n\nAktuelle Antwort:\n${getA}`
            : `What should the new answer be? (or type 'ok' to keep the current one)\n\nCurrent answer:\n${getA}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? "Wat is het antwoord?"
            : lang === "de"
            ? "Was ist die Antwort?"
            : "What is the answer?" },
        ]);
      }
      return true;
    }

    if (phase === "drafting-answer") {
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      let answer: string;
      if (action === "edit" && selectedFaq && text.trim().toLowerCase() === "ok") {
        answer = selectedFaq.answer;
      } else {
        answer = text.trim();
      }
      setDraftAnswer(answer);

      // If revising only answer, go straight to re-translate
      if (revisingField === "answer") {
        setRevisingField(null);
        const question = draftQuestion || (selectedFaq?.question ?? "");
        const sourceLang = detectLanguage(question + " " + answer);
        translateDraft(question, answer, sourceLang);
        return true;
      }

      showCategoryPicker();
      return true;
    }

    if (phase === "choose-category") {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      const trimmed = text.trim();
      // Check if it's a number referencing an existing category
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= categories.length && !trimmed.includes(",")) {
        setDraftCategory(categories[num - 1]);
      } else {
        setDraftCategory(trimmed);
      }

      // If revising only category, go back to preview without re-translating
      if (revisingField === "category") {
        setRevisingField(null);
        const cat = !isNaN(num) && num >= 1 && num <= categories.length && !trimmed.includes(",") ? categories[num - 1] : trimmed;
        if (translationsRef.current) {
          showPreview(translationsRef.current, cat, draftAudienceRef.current, draftUrlRef.current);
        }
        return true;
      }

      showAudiencePicker();
      return true;
    }

    if (phase === "choose-audience") {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      const trimmed = text.trim();
      // Parse: single number picks existing, comma-separated creates multiple
      const num = parseInt(trimmed, 10);
      let values: string[];
      if (!isNaN(num) && num >= 1 && num <= audiences.length && !trimmed.includes(",")) {
        values = [audiences[num - 1]];
      } else {
        values = trimmed.split(",").map((v) => v.trim()).filter(Boolean);
      }
      setDraftAudience(values);

      // If revising only audience, go back to preview without re-translating
      if (revisingField === "audience") {
        setRevisingField(null);
        if (translationsRef.current) {
          showPreview(translationsRef.current, draftCategoryRef.current, values, draftUrlRef.current);
        }
        return true;
      }

      showLinkChoice();
      return true;
    }

    if (phase === "choose-link") {
      const lower = text.trim().toLowerCase();
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      if (["ja", "yes", "ja!", "yes!", "y", "j"].includes(lower)) {
        setPhase("drafting-link");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? "Plak de link (URL):"
            : lang === "de"
            ? "Füge den Link (URL) ein:"
            : "Paste the link (URL):" },
        ]);
      } else {
        setDraftUrl("");
        // If revising link and chose "no", go back to preview
        if (revisingField === "link") {
          setRevisingField(null);
          if (translationsRef.current) {
            showPreview(translationsRef.current, draftCategoryRef.current, draftAudienceRef.current, "");
          }
          return true;
        }
        const question = draftQuestion || (selectedFaq?.question ?? "");
        const answer = draftAnswer || (selectedFaq?.answer ?? "");
        const sourceLang = detectLanguage(question + " " + answer);
        translateDraft(question, answer, sourceLang);
      }
      return true;
    }

    if (phase === "drafting-link") {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      const url = text.trim();
      setDraftUrl(url);

      // If revising only link, go back to preview
      if (revisingField === "link") {
        setRevisingField(null);
        if (translationsRef.current) {
          showPreview(translationsRef.current, draftCategoryRef.current, draftAudienceRef.current, url);
        }
        return true;
      }

      const question = draftQuestion || (selectedFaq?.question ?? "");
      const answer = draftAnswer || (selectedFaq?.answer ?? "");
      const sourceLang = detectLanguage(question + " " + answer);
      translateDraft(question, answer, sourceLang);
      return true;
    }

    if (phase === "revise") {
      const lower = text.trim().toLowerCase();
      setMessages((prev) => [...prev, { role: "user", content: text }]);

      if (["vraag", "question", "frage", "q"].includes(lower)) {
        setRevisingField("question");
        setPhase("drafting-question");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? "Wat wordt de nieuwe vraag?"
            : lang === "de"
            ? "Was wird die neue Frage?"
            : "What should the new question be?" },
        ]);
      } else if (["antwoord", "answer", "antwort", "a"].includes(lower)) {
        setRevisingField("answer");
        setPhase("drafting-answer");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? "Wat wordt het nieuwe antwoord?"
            : lang === "de"
            ? "Was wird die neue Antwort?"
            : "What should the new answer be?" },
        ]);
      } else if (["categorie", "category", "kategorie", "cat"].includes(lower)) {
        setRevisingField("category");
        showCategoryPicker();
      } else if (["doelgroep", "audience", "zielgruppe", "aud"].includes(lower)) {
        setRevisingField("audience");
        showAudiencePicker();
      } else if (["link", "url"].includes(lower)) {
        setRevisingField("link");
        showLinkChoice();
      } else if (["beide", "both", "beides", "alles", "all"].includes(lower)) {
        setRevisingField(null);
        setPhase("drafting-question");
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? "Wat wordt de nieuwe vraag?"
            : lang === "de"
            ? "Was wird die neue Frage?"
            : "What should the new question be?" },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: lang === "nl"
            ? "Kies: Vraag, Antwoord, Categorie, Doelgroep, Link of Alles"
            : lang === "de"
            ? "Wähle: Frage, Antwort, Kategorie, Zielgruppe, Link oder Alles"
            : "Choose: Question, Answer, Category, Audience, Link, or All" },
        ]);
      }
      return true;
    }

    return false;
  }, [phase, action, selectedFaq, draftQuestion, draftAnswer, faqs, categories, audiences, revisingField, chooseFaq, translateDraft, showCategoryPicker, showAudiencePicker, showLinkChoice, showPreview, setMessages, lang]);

  return {
    phase,
    action,
    selectedFaq,
    translations,
    error,
    categories,
    audiences,
    startAdmin,
    chooseAction,
    chooseFaq,
    translateDraft,
    apply,
    cancel,
    revise,
    reset,
    handleAdminInput,
  };
}

function detectLanguage(text: string): "en" | "nl" | "de" {
  const lower = text.toLowerCase();
  const nlWords = ["de", "het", "een", "van", "in", "is", "dat", "op", "voor", "met", "niet", "zijn", "aan", "er", "maar", "ook", "nog", "wel", "kan", "dit", "wat", "wordt", "waar", "hoe", "je", "we", "ons"];
  const deWords = ["der", "die", "das", "und", "ist", "von", "zu", "den", "mit", "auf", "für", "nicht", "sich", "ein", "eine", "dem", "des", "auch", "nach", "wie", "kann", "wird", "wir", "uns"];
  const enWords = ["the", "is", "are", "and", "of", "to", "in", "for", "that", "with", "not", "this", "but", "from", "they", "was", "have", "can", "will", "you", "we", "our"];

  const words = lower.split(/\s+/);
  let nlScore = 0, deScore = 0, enScore = 0;

  for (const word of words) {
    if (nlWords.includes(word)) nlScore++;
    if (deWords.includes(word)) deScore++;
    if (enWords.includes(word)) enScore++;
  }

  if (nlScore > deScore && nlScore > enScore) return "nl";
  if (deScore > nlScore && deScore > enScore) return "de";
  return "en";
}
