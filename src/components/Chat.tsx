"use client";

import { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import type { UiLabels } from "@/lib/i18n/labels";
const FaqModal = lazy(() => import("./FaqModal"));
import type { Message, FlowOption, FlowStep, StructuredContent, CardAction } from "@/types/chat";
import { fetchRetry } from "@/lib/fetch-retry";

import { useKbStatus } from "@/hooks/useKbStatus";
import { useFaqSuggestions } from "@/hooks/useFaqSuggestions";
import { useRating } from "@/hooks/useRating";
import { useFlow, buildMergedWelcomeStep } from "@/hooks/useFlow";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useFaqAdmin } from "@/hooks/useFaqAdmin";

import ChatHeader from "./chat/ChatHeader";
import WelcomeScreen from "./chat/WelcomeScreen";
import MessageList from "./chat/MessageList";
import ChatInput from "./chat/ChatInput";
import KbStatusBar from "./chat/KbStatusBar";

export default function Chat() {
  const { t, lang, setTranslations, resetLanguage, switchLanguage } = useI18n();
  const searchParams = useSearchParams();
  const [shopifyUser, setShopifyUser] = useState<{ email: string; firstName: string; lastName: string; displayName: string } | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sendAnimating, setSendAnimating] = useState(false);
  const [starters, setStarters] = useState<{ question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string }[]>([]);
  const [faqs, setFaqs] = useState<{ question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string; category: string[]; audience: string[]; url: string }[]>([]);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const [shareStatus, setShareStatus] = useState<"idle" | "sharing" | "copied" | "error">("idle");
  const [langOpen, setLangOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID().slice(0, 8));
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sharedChatIdRef = useRef(searchParams.get("chat"));
  const [autoDebug, setAutoDebug] = useState(false);
  const debugMode = autoDebug || searchParams.get("debug") === "true" || (typeof window !== "undefined" && window.location.hostname === "localhost");
  const client = searchParams.get("client");
  const roleOverride = useMemo(() => {
    const param = searchParams.get("role");
    return param ? param.split(",").map(r => r.trim()).filter(Boolean) : undefined;
  }, [searchParams]);
  const userEmailOverride = searchParams.get("user") || undefined;

  const [isTouchDevice] = useState(() =>
    typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0)
  );

  const { kbStatus, kbExpanded, setKbExpanded, fetchKbStatus, startPolling, stopPolling } = useKbStatus();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
    if (!isTouchDevice) inputRef.current?.focus();
  }, [messages, isTouchDevice]);

  // Browser back button: undo last booking detail navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.messageCount != null) {
        setMessages((prev) => prev.slice(0, e.state.messageCount));
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // Resize container to visual viewport so input stays above iOS keyboard
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let prevHeight = vv.height;
    const sync = () => {
      if (shellRef.current) {
        shellRef.current.style.height = `${vv.height}px`;
        shellRef.current.style.top = `${vv.offsetTop}px`;
      }
      // Only force scroll when viewport shrinks (keyboard opening)
      if (vv.height < prevHeight) {
        window.scrollTo(0, 0);
        scrollToBottom();
      }
      prevHeight = vv.height;
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !isTouchDevice) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading, isTouchDevice]);

  const getQ = useCallback((item: { question: string; questionNl: string; questionDe: string }) => {
    if (lang === "nl" && item.questionNl) return item.questionNl;
    if (lang === "de" && item.questionDe) return item.questionDe;
    return item.question;
  }, [lang]);

  const getA = useCallback((item: { answer: string; answerNl: string; answerDe: string }) => {
    if (lang === "nl" && item.answerNl) return item.answerNl;
    if (lang === "de" && item.answerDe) return item.answerDe;
    return item.answer;
  }, [lang]);

  const getFlowMessage = useCallback((step: FlowStep) => {
    if (lang === "nl" && step.messageNl) return step.messageNl;
    if (lang === "de" && step.messageDe) return step.messageDe;
    return step.message;
  }, [lang]);

  const getFlowLabel = useCallback((option: FlowOption) => {
    if (lang === "nl" && option.labelNl) return option.labelNl;
    if (lang === "de" && option.labelDe) return option.labelDe;
    return option.label;
  }, [lang]);

  const getFlowEndPrompt = useCallback((step: FlowStep) => {
    if (lang === "nl" && step.endPromptNl) return step.endPromptNl;
    if (lang === "de" && step.endPromptDe) return step.endPromptDe;
    return step.endPrompt;
  }, [lang]);

  const getFlowFaqQuestion = useCallback((step: FlowStep) => {
    if (lang === "nl" && step.relatedFaqQuestionNl) return step.relatedFaqQuestionNl;
    if (lang === "de" && step.relatedFaqQuestionDe) return step.relatedFaqQuestionDe;
    return step.relatedFaqQuestion;
  }, [lang]);

  const getFlowFaqAnswer = useCallback((step: FlowStep) => {
    if (lang === "nl" && step.relatedFaqAnswerNl) return step.relatedFaqAnswerNl;
    if (lang === "de" && step.relatedFaqAnswerDe) return step.relatedFaqAnswerDe;
    return step.relatedFaqAnswer;
  }, [lang]);

  // Brief delay to show thinking dots for instant answers
  const showWithThinkingDelay = useCallback(async (
    baseMessages: Message[],
    answer: string,
    onComplete?: () => void
  ) => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 500));
    setMessages([...baseMessages, { role: "assistant", content: answer }]);
    setIsLoading(false);
    onComplete?.();
  }, []);

  const findInstantAnswer = (text: string): { answer: string; url?: string; question: string } | null => {
    const q = text.trim().toLowerCase();
    const starter = starters.find((s) =>
      s.question.toLowerCase() === q ||
      s.questionNl.toLowerCase() === q ||
      s.questionDe.toLowerCase() === q
    );
    if (starter) { const a = getA(starter); if (a) return { answer: a, question: getQ(starter) }; }
    const faq = faqs.find((f) =>
      f.question.toLowerCase() === q ||
      f.questionNl.toLowerCase() === q ||
      f.questionDe.toLowerCase() === q
    );
    if (faq) { const a = getA(faq); if (a) return { answer: a, url: faq.url || undefined, question: getQ(faq) }; }
    return null;
  };

  const logChat = useCallback((question: string, answer: string) => {
    const sourceMatch = answer.match(/\[source:\s*(.+?)\]\s*$/i);
    const source = sourceMatch?.[1] || null;
    fetch("/api/chat/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, source, lang, sessionId, email: shopifyUser?.email }),
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.logId) {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 && m.role === "assistant"
                ? { ...m, logId: data.logId }
                : m
            )
          );
        }
      })
      .catch(() => {});
  }, [lang, sessionId, shopifyUser?.email]);

  // sendMessage must be declared before useFlow (which needs it as a parameter)
  // We use a ref to break the circular dependency
  const sendMessageRef = useRef<(text: string, baseMessages?: Message[], hidden?: boolean, focused?: boolean) => Promise<void>>(async () => {});
  const capabilityActionRef = useRef<(action: string) => void>(() => {});
  const loginRef = useRef<() => void>(() => {});

  const {
    flowSteps,
    setFlowSteps,
    flowPhase,
    setFlowPhase,
    currentFlowStep,
    setCurrentFlowStep,
    flowContext,
    handleFlowOption,
    handleNewChat: handleNewChatFlow,
  } = useFlow({
    messages,
    setMessages,
    lang,
    userRoles,
    getFlowMessage,
    getFlowLabel,
    getFlowEndPrompt,
    getFlowFaqQuestion,
    getFlowFaqAnswer,
    showWithThinkingDelay,
    sendMessage: (...args) => sendMessageRef.current(...args),
    switchLanguage,
    sharedChatIdRef,
    onCapabilityAction: (action) => capabilityActionRef.current(action),
    onLogin: () => loginRef.current(),
  });

  const { faqSuggestions, selectedSuggestion, setSelectedSuggestion } = useFaqSuggestions(input, faqs, starters, getQ);

  const {
    pendingFeedbackLogId,
    setPendingFeedbackLogId,
    feedbackFollowUpLogId,
    setFeedbackFollowUpLogId,
    feedbackContactLogId,
    setFeedbackContactLogId,
    rateMessage,
  } = useRating(messages, setMessages, lang, sessionId, t);

  const adminEmails = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "wesley@eflight.nl", "paulien@eflight.nl", "milos@eflight.nl"];
  const isAdmin = !!shopifyUser?.email && adminEmails.includes(shopifyUser.email.toLowerCase());

  const autoDebugEmails = ["matthijs@eflight.nl", "matthijscollard@gmail.com", "milos@eflight.nl"];
  useEffect(() => {
    if (shopifyUser?.email && autoDebugEmails.includes(shopifyUser.email.toLowerCase())) {
      setAutoDebug(true);
    }
  }, [shopifyUser?.email]);

  const {
    phase: adminPhase,
    categories: adminCategories,
    audiences: adminAudiences,
    startAdmin,
    chooseAction,
    apply: applyAdmin,
    cancel: cancelAdmin,
    revise: reviseAdmin,
    reset: resetAdmin,
    handleAdminInput,
  } = useFaqAdmin({ faqs, setFaqs, setMessages, lang });

  const sendMessage = useCallback(async (text: string, baseMessages?: Message[], hidden = false, focused = false) => {
    if (!text.trim()) return;

    // Intercept for FAQ admin flow
    if (adminPhase !== "idle" && !hidden) {
      const handled = handleAdminInput(text);
      if (handled) {
        setInput("");
        return;
      }
    }

    setFollowUpSuggestions([]);

    const exitFeedback = (pendingFeedbackLogId || feedbackContactLogId) && faqSuggestions.some((s) => s === text);
    if (exitFeedback) {
      setPendingFeedbackLogId(null);
      setFeedbackContactLogId(null);
      setFeedbackFollowUpLogId(null);
    }

    if (pendingFeedbackLogId && !exitFeedback && !hidden) {
      const logId = pendingFeedbackLogId;
      setPendingFeedbackLogId(null);
      const userMsg: Message = { role: "user", content: text };
      const confirmMsg: Message = { role: "assistant", content: t("feedback.saved") };
      const followUpMsg: Message = { role: "assistant", content: t("feedback.followUp") };
      setMessages((prev) => [...prev, userMsg, confirmMsg, followUpMsg]);
      setInput("");
      setFeedbackFollowUpLogId(logId);
      fetch(`/api/chat/log/${encodeURIComponent(logId)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: text }),
      }).catch(() => {});
      return;
    }

    if (feedbackContactLogId && !exitFeedback && !hidden) {
      const logId = feedbackContactLogId;
      setFeedbackContactLogId(null);
      const userMsg: Message = { role: "user", content: text };
      const confirmMsg: Message = { role: "assistant", content: t("feedback.contactSaved") };
      setMessages((prev) => [...prev, userMsg, confirmMsg]);
      setInput("");
      fetch(`/api/chat/log/${encodeURIComponent(logId)}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: text }),
      }).catch(() => {});
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    let base = baseMessages ?? messages;
    if (flowPhase === "active" && !baseMessages) {
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      base = [];
    } else if (flowPhase === "active") {
      setFlowPhase("completed");
      setCurrentFlowStep(null);
    }
    const userMessage: Message = { role: "user", content: text };
    const apiMessages = [...base, userMessage];
    const displayMessages = hidden ? base : apiMessages;
    setMessages(displayMessages);
    setInput("");

    if (!hidden) {
      const instantResult = findInstantAnswer(text);
      if (instantResult) {
        const answerWithSource = instantResult.url
          ? `${instantResult.answer}\n\n[source: FAQ | ${instantResult.url} | ${instantResult.question}]`
          : `${instantResult.answer}\n\n[source: FAQ | ${instantResult.question}]`;
        showWithThinkingDelay(displayMessages, answerWithSource, () => logChat(text, answerWithSource));
        return;
      }
    }

    setIsLoading(true);
    setProgressSteps([]);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, lang: lang || "en", flowContext, roleOverride, userEmail: userEmailOverride, ...(focused && { focused: true }) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let errorMsg = t("chat.error");
        if (response.status === 429) {
          errorMsg = lang === "nl" ? "Je stuurt te veel berichten. Wacht even en probeer het opnieuw."
            : lang === "de" ? "Du sendest zu viele Nachrichten. Bitte warte einen Moment."
            : "You're sending too many messages. Please wait a moment and try again.";
        } else {
          try {
            const data = await response.json();
            if (data.error) errorMsg = `Error: ${data.error}`;
          } catch {
            // Response body empty or not JSON
          }
        }
        setMessages([...displayMessages, { role: "assistant", content: errorMsg }]);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "progress") {
              setProgressSteps((prev) => [...prev, msg.step]);
            } else if (msg.type === "chunk") {
              if (!accumulated) setProgressSteps([]);
              accumulated += msg.text;
              setMessages([...displayMessages, { role: "assistant", content: accumulated }]);
            } else if (msg.type === "done") {
              accumulated = accumulated.replace(/\n?\[suggestions:\s*[^\]]+\]/i, "").trimEnd();
              accumulated = accumulated.replace(/\n?\[lang:\s*[a-z]{2}\s*\]/i, "").trimEnd();
              if (msg.source) {
                accumulated = accumulated.replace(
                  /\[source:\s*(?:Website|FAQ|Products?)\s*(?:\|[^\]]*)?\]/i,
                  msg.source
                );
              }
              setMessages([...displayMessages, { role: "assistant", content: accumulated }]);
              logChat(text, accumulated);
              if (msg.suggestions && Array.isArray(msg.suggestions)) {
                setFollowUpSuggestions(msg.suggestions);
              }
              if (msg.lang) {
                if (msg.translations) {
                  setTranslations(msg.lang, msg.translations as UiLabels);
                } else if (msg.lang === "en") {
                  resetLanguage();
                } else {
                  // Translations not included — fetch them client-side
                  switchLanguage(msg.lang);
                }
              }
              // Refresh KB status after chat loads data (populates Redis counts)
              if (debugMode) fetchKbStatus(true);
            } else if (msg.type === "error") {
              if (!accumulated) {
                setMessages([
                  ...displayMessages,
                  { role: "assistant", content: t("chat.error") },
                ]);
              }
            }
          } catch {
            // Skip malformed lines
          }
        }
      }

      if (!accumulated) {
        setMessages([
          ...displayMessages,
          { role: "assistant", content: t("chat.error") },
        ]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      setMessages([
        ...displayMessages,
        { role: "assistant", content: t("chat.error") },
      ]);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      fetchKbStatus(debugMode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, flowPhase, flowContext, pendingFeedbackLogId, feedbackContactLogId, faqSuggestions, lang, sessionId, t, setTranslations, resetLanguage, switchLanguage, fetchKbStatus, showWithThinkingDelay, logChat, setFlowPhase, setCurrentFlowStep, setPendingFeedbackLogId, setFeedbackContactLogId, setFeedbackFollowUpLogId, adminPhase, handleAdminInput]);

  // Keep the ref in sync
  sendMessageRef.current = sendMessage;

  const handleCapabilityAction = useCallback(async (action: string) => {
    setIsLoading(true);
    setProgressSteps([]);
    setFlowPhase("completed");
    setCurrentFlowStep(null);
    try {
      const params: Record<string, unknown> = { action };
      if (userEmailOverride) params.userEmail = userEmailOverride;
      if (roleOverride) params.roleOverride = roleOverride;
      const res = await fetch("/api/capability-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load data");
      }
      const structured: StructuredContent = await res.json();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: structured.summary,
        structured,
      }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  }, [userEmailOverride, roleOverride, setFlowPhase, setCurrentFlowStep]);

  capabilityActionRef.current = handleCapabilityAction;

  // Card actions from flow steps with trigger
  const bookingDetailActions = useMemo<CardAction[]>(() =>
    flowSteps
      .filter((s) => s.trigger?.split(",").includes("booking-detail"))
      .map((s) => ({ name: s.name, label: s.message || s.name, icon: null, contextKey: s.contextKey, endPrompt: s.endPrompt })),
    [flowSteps]
  );

  const handleCardAction = useCallback(async (action: CardAction, context: Record<string, string>) => {
    setIsLoading(true);
    setProgressSteps([]);
    try {
      // 1. Fetch data via capability action
      const params: Record<string, unknown> = {
        action: action.contextKey,
        studentUserId: context.studentUserId ? Number(context.studentUserId) : undefined,
        studentName: context.studentName,
        bookingId: context.bookingId ? Number(context.bookingId) : undefined,
        previousLessonBookingId: context.previousLessonBookingId ? Number(context.previousLessonBookingId) : undefined,
      };
      if (userEmailOverride) params.userEmail = userEmailOverride;
      if (roleOverride) params.roleOverride = roleOverride;

      const res = await fetch("/api/capability-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load data");
      }
      const result = await res.json();

      const replacePlaceholders = (s: string) => s.replace(/\{(\w+)\}/g, (_, key) => {
        if (key === "context") return result.context || "";
        return context[key] || key;
      });
      const label = replacePlaceholders(action.label);
      const studentName = context.studentName || "";
      const userMsg: Message = { role: "user", content: studentName && !label.includes(studentName) ? `${label} — ${studentName}` : label };
      setMessages((prev) => [...prev, userMsg]);

      // If result is structured content (schedule, booking-detail, student-lessons), render directly
      if (result.type && result.type !== "lesson-context" && result.data) {
        const structured: StructuredContent = result;
        setMessages((prev) => [...prev, { role: "assistant", content: structured.summary, structured }]);
      } else {
        // Send the endPrompt + context to Gemini via chat
        const prompt = replacePlaceholders(action.endPrompt);
        await sendMessageRef.current(prompt, [...messages, userMsg], true, true);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  }, [userEmailOverride, roleOverride, messages]);

  // Initial data fetch
  useEffect(() => {
    if (!isTouchDevice) inputRef.current?.focus();
    fetchKbStatus(debugMode).then((data) => {
      if (data?.status !== "synced") {
        startPolling();
        fetch("/api/knowledge-base/warm", { method: "POST" }).catch(() => {});
      }
    });
    fetchRetry("/api/starters")
      .then((res) => res.json())
      .then((data) => setStarters(data))
      .catch(() => {});
    fetchRetry("/api/faqs")
      .then((res) => res.json())
      .then((data) => setFaqs(data))
      .catch(() => {});
    const isSharedChat = !!sharedChatIdRef.current;
    fetchRetry("/api/guided-flows")
      .then((res) => res.json())
      .then((data: FlowStep[]) => {
        setFlowSteps(data);
        if (isSharedChat) return;
        if (data.length > 0) {
          const welcome = buildMergedWelcomeStep(data, userRoles);
          if (welcome) {
            setCurrentFlowStep(welcome);
            setFlowPhase("active");
            setMessages([{ role: "assistant", content: getFlowMessage(welcome) }]);
          } else {
            setFlowPhase("skipped");
          }
        } else {
          setFlowPhase("skipped");
        }
      })
      .catch(() => {
        if (!isSharedChat) setFlowPhase("skipped");
      });
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKbStatus, startPolling, stopPolling]);

  // Check Shopify session
  const checkSession = useCallback(() => {
    const params = new URLSearchParams();
    if (userEmailOverride) params.set("userEmail", userEmailOverride);
    if (roleOverride) params.set("roleOverride", roleOverride.join(","));
    const sessionUrl = params.toString()
      ? `/api/auth/shopify/session?${params}`
      : "/api/auth/shopify/session";
    fetch(sessionUrl)
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.customer) {
          setShopifyUser(data.customer);
          setUserRoles(data.roles || []);
          setCapabilities(data.capabilities || []);
          // Re-fetch FAQs for authenticated audience
          fetchRetry("/api/faqs").then((res) => res.json()).then((d) => setFaqs(d)).catch(() => {});
        }
      })
      .catch(() => {});
  }, [roleOverride, userEmailOverride]);

  useEffect(() => {
    checkSession();
    if (client === "briefing") {
      window.addEventListener("focus", checkSession);
      return () => window.removeEventListener("focus", checkSession);
    }
  }, [checkSession, client]);

  // Cycling multilingual placeholder
  const cyclingPlaceholders = useMemo(() => [
    "Type your question in English...",
    "Stel je vraag in het Nederlands...",
    "Stelle deine Frage auf Deutsch...",
  ], []);

  useEffect(() => {
    if (messages.some((m) => m.role === "user") || input) return;
    const interval = setInterval(() => {
      setPhVisible(false);
      setTimeout(() => {
        setPhIndex((i) => (i + 1) % cyclingPlaceholders.length);
        setPhVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [messages, input, cyclingPlaceholders]);

  const handleShopifyLogin = () => {
    if (window.self !== window.top) {
      window.open("/api/auth/shopify/login", "_blank");
    } else {
      window.location.href = "/api/auth/shopify/login";
    }
  };
  loginRef.current = handleShopifyLogin;

  const handleShopifyLogout = async () => {
    await fetch("/api/auth/shopify/logout", { method: "POST" });
    setShopifyUser(null);
    setUserRoles([]);
    setCapabilities([]);
    // Re-fetch FAQs for public audience
    fetchRetry("/api/faqs").then((res) => res.json()).then((data) => setFaqs(data)).catch(() => {});
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    if (isListening) stopListening();
    setSendAnimating(true);
    setTimeout(() => setSendAnimating(false), 400);
    sendMessage(input);
    inputRef.current?.focus();
  };

  const handleFaqSelect = (question: string) => {
    setShowFaqModal(false);
    sendMessage(question);
  };

  const handleNewChat = () => {
    resetAdmin();
    handleNewChatFlow(inputRef, setInput);
  };

  const handleShare = async () => {
    if (messages.length === 0 || shareStatus === "sharing") return;
    setShareStatus("sharing");
    try {
      const res = await fetch("/api/chat/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, flowContext, lang, currentFlowStepName: currentFlowStep?.name, flowPhase }),
      });
      if (!res.ok) throw new Error("Failed to share");
      const { id } = await res.json();
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("chat", id);
      const shareUrl = url.toString();
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ url: shareUrl });
        setShareStatus("idle");
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("copied");
        setTimeout(() => setShareStatus("idle"), 3000);
      }
    } catch (err) {
      // User cancelled native share sheet — not an error
      if (err instanceof Error && err.name === "AbortError") {
        setShareStatus("idle");
      } else {
        setShareStatus("error");
        setTimeout(() => setShareStatus("idle"), 3000);
      }
    }
  };

  const isKiosk = client === "kiosk";
  const hasUserMessages = useMemo(() => messages.some((m) => m.role === "user") || (isAdmin && adminPhase !== "idle"), [messages, isAdmin, adminPhase]);

  const displayRole = useMemo(() => {
    if (userRoles.length === 0) return t("header.role.visitor");
    const roleMap: Record<string, keyof UiLabels> = {
      student: "header.role.student",
      instructor: "header.role.instructor",
    };
    return userRoles
      .map((r) => { const key = roleMap[r.toLowerCase()]; return key ? t(key) : r; })
      .join(", ");
  }, [userRoles, t]);

  // Update page title
  useEffect(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      const q = lastUserMsg.content.length > 60
        ? lastUserMsg.content.slice(0, 57) + "..."
        : lastUserMsg.content;
      document.title = `${q} · Steward · E-Flight Academy`;
    } else {
      document.title = "Steward · E-Flight Academy Virtual Assistant";
    }
  }, [messages]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (faqSuggestions.length > 0 && selectedSuggestion >= 0) {
        e.preventDefault();
        sendMessage(faqSuggestions[selectedSuggestion]);
        return;
      }
      e.preventDefault();
      if (input.trim()) {
        const form = e.currentTarget.closest("form");
        form?.requestSubmit();
      }
      return;
    }
    if (faqSuggestions.length === 0) return;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSuggestion((prev) =>
        prev <= 0 ? faqSuggestions.length - 1 : prev - 1
      );
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSuggestion((prev) =>
        prev >= faqSuggestions.length - 1 ? 0 : prev + 1
      );
    } else if (e.key === "Escape") {
      setSelectedSuggestion(-1);
    }
  };

  const autoResizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * 10;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    autoResizeTextarea();
  }, [input, autoResizeTextarea]);

  const { isListening, isSupported: isMicSupported, toggle: toggleMic, stopListening } = useSpeechRecognition(
    useCallback((text: string) => {
      setInput(text);
      setTimeout(() => autoResizeTextarea(), 0);
    }, [autoResizeTextarea])
  );

  const [listeningLang, setListeningLang] = useState<string | null>(null);

  // Reset listeningLang when speech recognition stops
  useEffect(() => {
    if (!isListening) setListeningLang(null);
  }, [isListening]);

  const handleMicClick = useCallback(() => {
    if (!isListening) setListeningLang(lang);
    toggleMic(lang);
  }, [toggleMic, lang, isListening]);

  const handleTapAndTalk = useCallback((tapLang: string) => {
    // If already listening in this language, stop
    if (isListening && listeningLang === tapLang) {
      toggleMic(tapLang);
      return;
    }
    // Switch language and start listening
    if (tapLang !== lang) {
      switchLanguage(tapLang);
    }
    setListeningLang(tapLang);
    // Small delay if already listening (to stop first), then start
    setTimeout(() => {
      toggleMic(tapLang);
    }, isListening ? 200 : 0);
  }, [isListening, listeningLang, lang, switchLanguage, toggleMic]);

  const handleBookingClick = useCallback(async (bookingId: number, date: string, time: string, student: string) => {
    const formatted = new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const userMsg: Message = { role: "user", content: `Details of the lesson of ${formatted} ${time} ${student}` };
    setMessages((prev) => {
      window.history.pushState({ messageCount: prev.length }, "");
      return [...prev, userMsg];
    });
    setIsLoading(true);
    setProgressSteps([]);
    try {
      const params: Record<string, unknown> = { action: "booking-detail", bookingId };
      if (userEmailOverride) params.userEmail = userEmailOverride;
      if (roleOverride) params.roleOverride = roleOverride;
      const res = await fetch("/api/capability-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load booking details");
      }
      const structured: StructuredContent = await res.json();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: structured.summary,
        structured,
      }]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [...prev, { role: "assistant", content: errorMsg }]);
    } finally {
      setIsLoading(false);
    }
  }, [userEmailOverride, roleOverride]);

  const handleAvatarClick = useCallback(() => {
    const question = lang === "nl" ? "Wie is Steward?" : lang === "de" ? "Wer ist Steward?" : "Who is Steward?";
    sendMessage(question);
  }, [lang, sendMessage]);

  return (
    <div ref={shellRef} className="flex flex-col fixed left-0 right-0 top-0 h-screen">
      <ChatHeader
        client={client}
        lang={lang}
        langOpen={langOpen}
        setLangOpen={setLangOpen}
        switchLanguage={switchLanguage}
        shopifyUser={shopifyUser}
        userMenuOpen={userMenuOpen}
        setUserMenuOpen={setUserMenuOpen}
        displayRole={displayRole}
        messagesLength={messages.length}
        shareStatus={shareStatus}
        onNewChat={handleNewChat}
        onShare={handleShare}
        onFaqOpen={() => setShowFaqModal(true)}
        onAvatarClick={handleAvatarClick}
        onLogin={handleShopifyLogin}
        onLogout={handleShopifyLogout}
        isAdmin={isAdmin}
        onFaqAdmin={startAdmin}
        t={t}
      />

      <div className={`flex-1 overflow-y-auto p-2 sm:p-4 bg-background dark:bg-gray-950 ${hasUserMessages ? "space-y-6" : `flex flex-col items-center ${client === "briefing" ? "justify-end pb-4" : isKiosk ? "justify-start pt-6" : "justify-center"}`}`}>
        {!hasUserMessages && (
          <WelcomeScreen
            flowPhase={flowPhase}
            messages={messages}
            currentFlowStep={currentFlowStep}
            isLoading={isLoading}
            handleFlowOption={handleFlowOption}
            getFlowLabel={getFlowLabel}
            starters={starters}
            faqs={faqs}
            getQ={getQ}
            sendMessage={sendMessage}
            onFaqOpen={() => setShowFaqModal(true)}
            onAvatarClick={handleAvatarClick}
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            faqSuggestions={adminPhase !== "idle" ? [] : faqSuggestions}
            selectedSuggestion={selectedSuggestion}
            onKeyDown={handleInputKeyDown}
            sendAnimating={sendAnimating}
            inputRef={inputRef}
            autoResizeTextarea={autoResizeTextarea}
            onFaqSelect={(s) => sendMessage(s)}
            cyclingPlaceholders={cyclingPlaceholders}
            phIndex={phIndex}
            phVisible={phVisible}
            onMicClick={handleMicClick}
            isListening={isListening}
            isMicSupported={client !== "briefing" && isMicSupported}
            micStartLabel={t("chat.micStart")}
            micStopLabel={t("chat.micStop")}
            onTapAndTalk={isKiosk || (isTouchDevice && client !== "briefing" && typeof window !== "undefined" && window.innerWidth >= 768) ? handleTapAndTalk : undefined}
            listeningLang={listeningLang}
            kiosk={isKiosk}
            capabilities={capabilities}
            isLoggedIn={!!shopifyUser}
          />
        )}

        {hasUserMessages && (
          <MessageList
            messages={messages}
            onRate={rateMessage}
            onFaqClick={() => setShowFaqModal(true)}
            onAvatarClick={handleAvatarClick}
            flowPhase={flowPhase}
            currentFlowStep={currentFlowStep}
            isLoading={isLoading}
            handleFlowOption={handleFlowOption}
            getFlowLabel={getFlowLabel}
            feedbackFollowUpLogId={feedbackFollowUpLogId}
            setFeedbackFollowUpLogId={setFeedbackFollowUpLogId}
            setFeedbackContactLogId={setFeedbackContactLogId}
            setMessages={setMessages}
            shopifyUser={shopifyUser}
            followUpSuggestions={followUpSuggestions}
            onFollowUpSelect={(s) => sendMessage(s)}
            t={t}
            messagesEndRef={messagesEndRef}
            kiosk={isKiosk}
            adminPhase={isAdmin ? adminPhase : undefined}
            onAdminAction={isAdmin ? (a) => { chooseAction(a); if (!isTouchDevice) setTimeout(() => inputRef.current?.focus(), 50); } : undefined}
            onAdminApply={isAdmin ? applyAdmin : undefined}
            onAdminCancel={isAdmin ? cancelAdmin : undefined}
            onAdminRevise={isAdmin ? reviseAdmin : undefined}
            onAdminInput={isAdmin ? (text: string) => { handleAdminInput(text); } : undefined}
            adminCategories={isAdmin ? adminCategories : undefined}
            adminAudiences={isAdmin ? adminAudiences : undefined}
            lang={lang}
            progressSteps={progressSteps}
            capabilities={capabilities}
            isLoggedIn={!!shopifyUser}
            onBookingClick={handleBookingClick}
            cardActions={bookingDetailActions}
            onCardAction={handleCardAction}
          />
        )}

        {!hasUserMessages && <div ref={messagesEndRef} />}
      </div>

      {(hasUserMessages || isKiosk) && (
        <div className="border-t border-e-pale dark:border-gray-800 relative">
          <ChatInput
            input={input}
            setInput={setInput}
            onSubmit={handleSubmit}
            faqSuggestions={adminPhase !== "idle" ? [] : faqSuggestions}
            selectedSuggestion={selectedSuggestion}
            onKeyDown={handleInputKeyDown}
            sendAnimating={sendAnimating}
            placeholder={t("chat.placeholder")}
            inputRef={inputRef}
            autoResizeTextarea={autoResizeTextarea}
            onFaqSelect={(s) => sendMessage(s)}
            onMicClick={handleMicClick}
            isListening={isListening}
            isMicSupported={client !== "briefing" && isMicSupported}
            micStartLabel={t("chat.micStart")}
            micStopLabel={t("chat.micStop")}
            kiosk={isKiosk}
          />
        </div>
      )}

      {/* Knowledge base status bar - only visible with ?debug=true */}
      {debugMode && (
        <KbStatusBar
          kbStatus={kbStatus}
          kbExpanded={kbExpanded}
          onToggle={() => setKbExpanded(!kbExpanded)}
          t={t}
          currentClient={client}
          onRefreshStatus={() => fetchKbStatus(debugMode)}
        />
      )}

      {showFaqModal && (
        <Suspense fallback={null}>
          <FaqModal
            faqs={faqs}
            lang={lang}
            onClose={() => setShowFaqModal(false)}
            onSelectFaq={handleFaqSelect}
          />
        </Suspense>
      )}
    </div>
  );
}
