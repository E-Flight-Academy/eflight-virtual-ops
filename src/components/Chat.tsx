"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useI18n } from "@/lib/i18n/context";
import type { UiLabels } from "@/lib/i18n/labels";

interface Message {
  role: "user" | "assistant";
  content: string;
  logId?: string;
  rating?: "👍" | "👎";
}

interface FlowStep {
  name: string;
  message: string;
  options: string[];
  nextFlow: Record<string, string>;
  endAction: "Continue Flow" | "Start AI Chat";
  contextKey: string;
  endPrompt: string;
  order: number;
}

type FlowPhase = "loading" | "active" | "completed" | "skipped";

interface KbStatus {
  status: "synced" | "not_synced" | "loading";
  fileCount: number;
  fileNames: string[];
  lastSynced: string | null;
  faqCount?: number;
}

function timeAgo(isoDate: string): string {
  const seconds = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function Chat() {
  const { t, lang, translatedStarters, setTranslations, resetLanguage, switchLanguage } = useI18n();
  const searchParams = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [kbStatus, setKbStatus] = useState<KbStatus | null>(null);
  const [kbExpanded, setKbExpanded] = useState(false);
  const [starters, setStarters] = useState<{ question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string }[]>([]);
  const [faqs, setFaqs] = useState<{ question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string }[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("loading");
  const [flowContext, setFlowContext] = useState<Record<string, string>>({});
  const [currentFlowStep, setCurrentFlowStep] = useState<FlowStep | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "sharing" | "copied" | "error">("idle");
  const [sessionId] = useState(() => crypto.randomUUID().slice(0, 8));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sharedChatIdRef = useRef(searchParams.get("chat"));
  const pollCountRef = useRef(0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollCountRef.current = 0;
  }, []);

  const fetchKbStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge-base/status");
      if (res.ok) {
        const data: KbStatus = await res.json();
        setKbStatus(data);
        return data;
      }
    } catch {
      // Silently fail — status is informational
    }
    return null;
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollCountRef.current = 0;

    pollIntervalRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 40) {
        stopPolling();
        return;
      }
      const data = await fetchKbStatus();
      if (data?.status === "synced") {
        stopPolling();
      }
    }, 3000);
  }, [stopPolling, fetchKbStatus]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    if (isAuthenticated) {
      inputRef.current?.focus();
      // Check initial status, then start polling + warm
      fetchKbStatus().then((data) => {
        if (data?.status !== "synced") {
          startPolling();
          fetch("/api/knowledge-base/warm", { method: "POST" }).catch(() => {});
        }
      });
      // Fetch conversation starters and FAQ questions
      fetch("/api/starters")
        .then((res) => res.json())
        .then((data) => setStarters(data))
        .catch(() => {});
      fetch("/api/faqs")
        .then((res) => res.json())
        .then((data) => setFaqs(data))
        .catch(() => {});
      // Fetch guided flows (skip if loading a shared chat)
      if (sharedChatIdRef.current) {
        setFlowPhase("completed");
      } else {
        fetch("/api/guided-flows")
          .then((res) => res.json())
          .then((data: FlowStep[]) => {
            setFlowSteps(data);
            if (data.length > 0) {
              const welcome = data.find((s) => s.name.toLowerCase() === "welcome");
              if (welcome) {
                setCurrentFlowStep(welcome);
                setFlowPhase("active");
                setMessages([{ role: "assistant", content: welcome.message }]);
              } else {
                setFlowPhase("skipped");
              }
            } else {
              setFlowPhase("skipped");
            }
          })
          .catch(() => {
            setFlowPhase("skipped");
          });
      }
    }
    return () => stopPolling();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, fetchKbStatus, startPolling, stopPolling]);

  // Load shared chat from URL parameter
  useEffect(() => {
    const chatId = sharedChatIdRef.current;
    if (!chatId || !isAuthenticated) return;

    fetch(`/api/chat/share/${encodeURIComponent(chatId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Chat not found");
        return res.json();
      })
      .then((data) => {
        if (data.messages && Array.isArray(data.messages)) {
          setMessages(data.messages);
          if (data.flowContext) setFlowContext(data.flowContext);
          if (data.lang && data.lang !== "en") {
            switchLanguage(data.lang);
          }
          setFlowPhase("completed");
          setCurrentFlowStep(null);
        }
      })
      .catch(() => {
        // Chat not found or expired — start fresh
      })
      .finally(() => {
        sharedChatIdRef.current = null;
        // Clear URL parameter
        const url = new URL(window.location.href);
        url.searchParams.delete("chat");
        window.history.replaceState({}, "", url.toString());
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // Cycling multilingual placeholder for the initial empty state
  const cyclingPlaceholders = useMemo(() => [
    "Type your question in English...",
    "Stel je vraag in het Nederlands...",
    "Stelle deine Frage auf Deutsch...",
    "Posez votre question en français...",
    "Escribe tu pregunta en español...",
    "用中文输入您的问题...",
    "Ketik pertanyaan Anda dalam Bahasa Indonesia...",
  ], []);

  useEffect(() => {
    // Only cycle when on initial screen with no messages and no input
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        setIsAuthenticated(true);
      } else {
        setAuthError(t("login.error.incorrect"));
      }
    } catch {
      setAuthError(t("login.error.connection"));
    }
  };

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

  const findInstantAnswer = (text: string): string | null => {
    const q = text.trim().toLowerCase();
    // Check starters (match any language version)
    const starter = starters.find((s) =>
      s.question.toLowerCase() === q ||
      s.questionNl.toLowerCase() === q ||
      s.questionDe.toLowerCase() === q
    );
    if (starter) { const a = getA(starter); if (a) return a; }
    // Check all FAQs (match any language version)
    const faq = faqs.find((f) =>
      f.question.toLowerCase() === q ||
      f.questionNl.toLowerCase() === q ||
      f.questionDe.toLowerCase() === q
    );
    if (faq) { const a = getA(faq); if (a) return a; }
    return null;
  };

  const handleFlowOption = (option: string) => {
    if (!currentFlowStep) return;

    // Store the user's choice
    const newContext = { ...flowContext };
    if (currentFlowStep.contextKey) {
      newContext[currentFlowStep.contextKey] = option;
    }
    setFlowContext(newContext);

    // Add user's choice as a message
    const userMsg: Message = { role: "user", content: option };

    // Check if flow should end after this step
    if (currentFlowStep.endAction === "Start AI Chat") {
      const prompt = currentFlowStep.endPrompt;
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      setMessages((prev) => [...prev, userMsg]);
      // Auto-send end prompt to Gemini if configured
      if (prompt) {
        setTimeout(() => sendMessage(prompt), 100);
      }
      return;
    }

    // Find next step
    const nextStepName = currentFlowStep.nextFlow?.[option];
    if (!nextStepName) {
      console.warn(`No next flow mapping for option "${option}", ending flow`);
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      setMessages((prev) => [...prev, userMsg]);
      return;
    }

    const nextStep = flowSteps.find((s) => s.name === nextStepName);
    if (!nextStep) {
      console.warn(`Flow step "${nextStepName}" not found, ending flow`);
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      setMessages((prev) => [...prev, userMsg]);
      return;
    }

    // Show next step
    setCurrentFlowStep(nextStep);
    setMessages((prev) => [
      ...prev,
      userMsg,
      { role: "assistant", content: nextStep.message },
    ]);
  };

  const logChat = useCallback((question: string, answer: string) => {
    const sourceMatch = answer.match(/\[source:\s*(.+?)\]\s*$/i);
    const source = sourceMatch?.[1] || null;
    fetch("/api/chat/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, source, lang, sessionId }),
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
      .catch(() => {}); // Non-fatal
  }, [lang, sessionId]);

  const rateMessage = useCallback((logId: string, rating: "👍" | "👎") => {
    setMessages((prev) =>
      prev.map((m) => (m.logId === logId ? { ...m, rating } : m))
    );
    fetch(`/api/chat/log/${encodeURIComponent(logId)}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating }),
    }).catch(() => {}); // Non-fatal
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // If user types during active flow, end flow gracefully
    if (flowPhase === "active") {
      setFlowPhase("completed");
      setCurrentFlowStep(null);
    }

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");

    // Instant answer from FAQ/starter — no need for Gemini
    const instantAnswer = findInstantAnswer(text);
    if (instantAnswer) {
      setMessages([...newMessages, { role: "assistant", content: instantAnswer }]);
      logChat(text, instantAnswer);
      return;
    }

    // No instant match — ask Gemini
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, lang: lang || "en", flowContext }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (response.ok) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
        logChat(text, data.message);
        if (data.lang) {
          if (data.translations) {
            setTranslations(data.lang, data.translations as UiLabels);
          } else if (data.lang === "en") {
            resetLanguage();
          }
        }
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Request was aborted by a new message — don't show error
        return;
      }
      setMessages([
        ...newMessages,
        { role: "assistant", content: t("chat.error") },
      ]);
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
      fetchKbStatus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleNewChat = () => {
    if (messages.length > 0) {
      setShowResetConfirm(true);
    }
  };

  const handleShare = async () => {
    if (messages.length === 0 || shareStatus === "sharing") return;
    setShareStatus("sharing");
    try {
      const res = await fetch("/api/chat/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, flowContext, lang }),
      });
      if (!res.ok) throw new Error("Failed to share");
      const { id } = await res.json();
      const url = new URL(window.location.href);
      url.search = "";
      url.searchParams.set("chat", id);
      await navigator.clipboard.writeText(url.toString());
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 3000);
    } catch {
      setShareStatus("error");
      setTimeout(() => setShareStatus("idle"), 3000);
    }
  };

  const confirmNewChat = () => {
    setInput("");
    setShowResetConfirm(false);
    resetLanguage();
    setFlowContext({});
    // Restart flow from welcome if available
    const welcome = flowSteps.find((s) => s.name.toLowerCase() === "welcome");
    if (welcome) {
      setCurrentFlowStep(welcome);
      setFlowPhase("active");
      setMessages([{ role: "assistant", content: welcome.message }]);
    } else {
      setCurrentFlowStep(null);
      setFlowPhase("skipped");
      setMessages([]);
    }
    inputRef.current?.focus();
  };

  // Fuzzy search: match FAQ questions when user types 2+ characters
  const hasUserMessages = useMemo(() => messages.some((m) => m.role === "user"), [messages]);
  const faqSuggestions = useMemo(() => {
    const query = input.trim().toLowerCase();
    if (query.length < 2 || hasUserMessages) return [];
    // Check if input matches a starter exactly (user clicked a starter)
    if (starters.some((s) => getQ(s) === input)) return [];
    return faqs
      .filter((f) => {
        const lower = getQ(f).toLowerCase();
        return lower.includes(query) ||
          lower.split(/\s+/).some((word) => word.startsWith(query));
      })
      .map((f) => getQ(f))
      .slice(0, 5);
  }, [input, faqs, hasUserMessages, starters, getQ]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <form onSubmit={handleLogin} className="w-full max-w-sm p-8">
          <h1 className="text-xl font-extrabold text-e-indigo text-center mb-2">Steward</h1>
          <p className="text-sm text-e-grey text-center mb-6">{t("login.subtitle")}</p>
          {authError && (
            <p className="text-red-500 text-sm text-center mb-4">{authError}</p>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("login.placeholder")}
            className="w-full rounded-lg border border-e-grey-light dark:border-gray-700 px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-e-indigo bg-white dark:bg-gray-900"
            autoFocus
          />
          <button
            type="submit"
            disabled={!password}
            className="w-full px-6 py-2 bg-e-indigo text-white rounded-lg hover:bg-e-indigo-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t("login.button")}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      <header className="flex items-center justify-between p-4 border-b border-e-pale dark:border-gray-800">
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            disabled={messages.length === 0}
            title={t("header.newChat")}
            className="h-10 flex items-center gap-1.5 rounded-lg text-e-grey hover:bg-e-pale dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2 sm:pr-3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z" />
              <path d="m15 5 3 3" />
            </svg>
            <span className="hidden sm:inline text-sm">{t("header.newChat")}</span>
          </button>
          <button
            onClick={handleShare}
            disabled={messages.length === 0 || shareStatus === "sharing"}
            title={shareStatus === "copied" ? "Link copied!" : shareStatus === "error" ? "Failed to share" : t("header.share")}
            className="h-10 flex items-center gap-1.5 rounded-lg text-e-grey hover:bg-e-pale dark:hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed px-2 sm:pr-3"
          >
            {shareStatus === "copied" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : shareStatus === "error" ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            )}
            <span className="hidden sm:inline text-sm">
              {shareStatus === "copied" ? "Copied!" : shareStatus === "error" ? "Failed" : t("header.share")}
            </span>
          </button>
        </div>
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-e-indigo">Steward</h1>
          <p className="text-sm text-e-grey">{t("header.subtitle")}</p>
          <div className="flex justify-center gap-1 mt-1">
            {(["en", "nl", "de"] as const).map((code) => (
              <button
                key={code}
                onClick={() => switchLanguage(code)}
                className={`px-2 py-0.5 text-xs rounded font-medium transition-colors ${
                  lang === code
                    ? "bg-e-indigo text-white"
                    : "text-e-grey hover:bg-e-pale dark:hover:bg-gray-800"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => {
            setIsAuthenticated(false);
            setPassword("");
            setMessages([]);
            setKbStatus(null);
            setKbExpanded(false);
            setFaqs([]);
            setFlowSteps([]);
            setFlowPhase("loading");
            setFlowContext({});
            setCurrentFlowStep(null);
            resetLanguage();
          }}
          title={t("header.logout")}
          className="w-10 h-10 flex items-center justify-center rounded-lg text-e-grey hover:bg-e-pale dark:hover:bg-gray-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </header>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 mx-4 max-w-sm w-full">
            <p className="text-sm text-foreground mb-4">
              {t("reset.confirm")}
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-e-grey-light dark:border-gray-700 text-e-grey hover:bg-e-pale dark:hover:bg-gray-800 transition-colors"
              >
                {t("reset.cancel")}
              </button>
              <button
                onClick={confirmNewChat}
                className="px-4 py-2 text-sm rounded-lg bg-e-indigo text-white hover:bg-e-indigo-hover transition-colors"
              >
                {t("reset.confirmButton")}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-e-grey mt-8">
            <p>{t("chat.welcome")}</p>
            <p className="text-sm mt-2">{t("chat.welcomeSub")}</p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === "user"
                  ? "bg-e-indigo text-white"
                  : "bg-e-pale dark:bg-gray-800 text-foreground"
              }`}
            >
              {message.role === "user" ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (() => {
                const sourceMatch = message.content.match(/\n?\[source:\s*(.+?)\]\s*$/i);
                const body = sourceMatch ? message.content.slice(0, sourceMatch.index).trimEnd() : message.content;
                const source = sourceMatch?.[1];
                return (
                  <>
                    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
                      <ReactMarkdown>{body}</ReactMarkdown>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {source && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-600 select-none">{source}</span>
                      )}
                      {message.logId && (
                        <span className="flex gap-0.5 ml-auto">
                          <button
                            onClick={() => rateMessage(message.logId!, "👍")}
                            className={`text-xs px-1 rounded transition-colors ${
                              message.rating === "👍"
                                ? "text-emerald-500"
                                : "text-gray-300 dark:text-gray-600 hover:text-emerald-400"
                            }`}
                          >
                            👍
                          </button>
                          <button
                            onClick={() => rateMessage(message.logId!, "👎")}
                            className={`text-xs px-1 rounded transition-colors ${
                              message.rating === "👎"
                                ? "text-red-500"
                                : "text-gray-300 dark:text-gray-600 hover:text-red-400"
                            }`}
                          >
                            👎
                          </button>
                        </span>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        ))}

        {flowPhase === "active" && currentFlowStep && !isLoading && (
          <div className="flex flex-wrap gap-2 pl-1">
            {currentFlowStep.options.map((option, i) => (
              <button
                key={i}
                onClick={() => handleFlowOption(option)}
                className="text-sm px-3 py-1.5 rounded-full border border-e-indigo-light text-e-indigo hover:bg-e-indigo hover:text-white transition-colors"
              >
                {option}
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-e-pale dark:bg-gray-800 rounded-lg px-4 py-2">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.1s]" />
                <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-e-pale dark:border-gray-800">
        {faqSuggestions.length > 0 ? (
          <div className="px-4 pt-2 flex flex-col gap-1">
            {faqSuggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => sendMessage(suggestion)}
                className="text-left text-sm px-3 py-1.5 rounded-lg border border-e-indigo-light text-e-indigo hover:bg-e-indigo hover:text-white transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : !messages.some((m) => m.role === "user") && starters.length > 0 ? (
          <div className="px-4 pt-3 flex flex-wrap gap-2">
            {starters.map((starter, i) => {
              const displayText = getQ(starter);
              return (
                <button
                  key={i}
                  onClick={() => sendMessage(displayText)}
                  className="text-sm px-3 py-1.5 rounded-full border border-e-indigo-light text-e-indigo hover:bg-e-indigo hover:text-white transition-colors"
                >
                  {displayText}
                </button>
              );
            })}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={messages.some((m) => m.role === "user") ? t("chat.placeholder") : undefined}
                className="w-full rounded-lg border border-e-grey-light dark:border-gray-700 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-e-indigo bg-white dark:bg-gray-900"
              />
              {!input && !messages.some((m) => m.role === "user") && (
                <span
                  className={`absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 transition-opacity duration-400 ${phVisible ? "opacity-70" : "opacity-0"}`}
                >
                  {cyclingPlaceholders[phIndex]}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-6 py-2 bg-e-indigo text-white rounded-lg hover:bg-e-indigo-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {t("chat.send")}
            </button>
          </div>
        </form>
      </div>

      {/* Knowledge base status bar */}
      <div className="border-t border-e-pale dark:border-gray-800">
        <button
          onClick={() => setKbExpanded(!kbExpanded)}
          className="w-full px-4 py-2 flex items-center justify-center gap-2 text-xs text-e-grey hover:bg-e-pale-light dark:hover:bg-gray-900 transition-colors"
        >
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              kbStatus?.status === "synced"
                ? "bg-emerald-500"
                : kbStatus?.status === "loading"
                ? "bg-amber-400 animate-pulse"
                : "bg-e-grey-light"
            }`}
          />
          {kbStatus?.status === "synced" ? (
            <span>
              {t("kb.label")} &middot; {kbStatus.fileCount} {t("kb.files")}
              {kbStatus.faqCount != null && <> &middot; {kbStatus.faqCount} {t("kb.faqs")}</>}
              {kbStatus.lastSynced && <> &middot; {t("kb.synced")} {timeAgo(kbStatus.lastSynced)}</>}
            </span>
          ) : kbStatus?.status === "loading" ? (
            <span>{t("kb.label")} &middot; {t("kb.loading")}</span>
          ) : (
            <span>{t("kb.label")} &middot; {t("kb.notSynced")}</span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${kbExpanded ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        {kbExpanded && kbStatus?.status === "synced" && (
          <div className="px-4 pb-3 max-h-48 overflow-y-auto">
            <ul className="text-xs text-e-grey space-y-1">
              {kbStatus.fileNames.map((name, i) => (
                <li key={i} className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  {name}
                </li>
              ))}
            </ul>
          </div>
        )}

        {kbExpanded && kbStatus?.status === "loading" && (
          <div className="px-4 pb-3">
            <p className="text-xs text-e-grey">
              {t("kb.loadingDetail")}
            </p>
          </div>
        )}

        {kbExpanded && kbStatus?.status === "not_synced" && (
          <div className="px-4 pb-3">
            <p className="text-xs text-e-grey">
              {t("kb.notSyncedDetail")}
            </p>
          </div>
        )}

        <div className="px-4 pb-1 text-[10px] text-e-grey-light text-center select-none">
          v{process.env.NEXT_PUBLIC_VERSION} ({process.env.NEXT_PUBLIC_BUILD_ID})
        </div>
      </div>
    </div>
  );
}
