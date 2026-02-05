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
  const [langOpen, setLangOpen] = useState(false);
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
      // Small delay to ensure the bottom input is mounted after layout switch
      setTimeout(() => inputRef.current?.focus(), 50);
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
    if (query.length < 2) return [];
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
  }, [input, faqs, starters, getQ]);

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
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between p-4 border-b border-e-pale dark:border-gray-800">
        <div>
          <h1 className="text-2xl font-extrabold text-e-indigo">Steward</h1>
          <p className="text-sm text-e-grey">{t("header.subtitle")}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#F7F7F7] text-[#828282] text-sm font-medium hover:bg-[#ECECEC] transition-colors dark:bg-gray-800 dark:hover:bg-gray-700"
            >
              {lang.toUpperCase()}
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setLangOpen(false)} />
                <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-20 min-w-[80px]">
                  {(["en", "nl", "de"] as const).map((code) => (
                    <button
                      key={code}
                      onClick={() => { switchLanguage(code); setLangOpen(false); }}
                      className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                        lang === code
                          ? "bg-[#1515F5] text-white"
                          : "text-[#828282] hover:bg-[#F7F7F7] dark:hover:bg-gray-800"
                      }`}
                    >
                      {code.toUpperCase()}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleNewChat}
            disabled={messages.length === 0}
            title={t("header.newChat")}
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
            <span className="hidden sm:inline text-sm">{t("header.newChat")}</span>
          </button>
          <button
            onClick={handleShare}
            disabled={messages.length === 0 || shareStatus === "sharing"}
            title={shareStatus === "copied" ? "Link copied!" : shareStatus === "error" ? "Failed to share" : t("header.share")}
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            )}
            <span className="hidden sm:inline text-sm">
              {shareStatus === "copied" ? "Copied!" : shareStatus === "error" ? "Failed" : t("header.share")}
            </span>
          </button>
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
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="hidden sm:inline text-sm">{t("header.logout")}</span>
          </button>
        </div>
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

      <div className={`flex-1 overflow-y-auto p-4 bg-e-pale-light dark:bg-gray-950 ${hasUserMessages ? "space-y-6" : "flex flex-col items-center justify-center"}`}>
        {!hasUserMessages && (
          <div className="w-full max-w-2xl px-4 space-y-6">
            {/* Flow dialog (welcome message + options) — shown above input */}
            {messages.map((message, index) => (
              <div
                key={index}
                className="flex justify-start items-start gap-3"
              >
                <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
                <div className="max-w-[85%] text-foreground">
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {flowPhase === "active" && currentFlowStep && !isLoading && (
              <div className="flex flex-wrap gap-2 ml-11">
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

            {/* Suggested questions */}
            {starters.length > 0 && (
              <div className="max-w-[56rem] mx-auto px-6 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#828282" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                  </svg>
                  <span className="text-sm text-[#828282]">Suggested questions</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {starters.map((starter, i) => {
                    const displayText = getQ(starter);
                    return (
                      <button
                        key={i}
                        onClick={() => sendMessage(displayText)}
                        className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800"
                      >
                        {displayText}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* FAQ dropdown */}
            {faqSuggestions.length > 0 && (
              <div className="bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 rounded-lg shadow-lg overflow-y-auto max-h-64">
                {faqSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(suggestion)}
                    className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors border-b border-[#ECECEC] dark:border-gray-700 last:border-b-0"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}

            {/* Centered input */}
            <form onSubmit={handleSubmit}>
              <div className="flex gap-3 items-center">
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={undefined}
                    className="w-full rounded-full border border-e-grey-light dark:border-gray-700 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-e-indigo-light bg-white dark:bg-gray-900"
                  />
                  {!input && (
                    <span
                      className={`absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 transition-opacity duration-400 ${phVisible ? "opacity-70" : "opacity-0"}`}
                    >
                      {cyclingPlaceholders[phIndex]}
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-e-indigo-light text-white hover:bg-e-indigo disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        )}

        {hasUserMessages && messages.map((message, index) => (
          <div
            key={index}
            className={`flex max-w-4xl mx-auto w-full ${message.role === "user" ? "justify-end" : "justify-start items-start gap-3"}`}
          >
            {message.role === "assistant" && (
              <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 mt-0.5" />
            )}
            {message.role === "user" ? (
              <div className="max-w-[70%] bg-[#1515F5] text-white px-4 py-3 rounded-2xl" style={{ borderTopRightRadius: "2px" }}>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            ) : (() => {
              const sourceMatch = message.content.match(/\n?\[source:\s*(.+?)\]\s*$/i);
              const body = sourceMatch ? message.content.slice(0, sourceMatch.index).trimEnd() : message.content;
              const source = sourceMatch?.[1];
              return (
                <div className="max-w-[85%] text-foreground group/msg">
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
                    <ReactMarkdown>{body}</ReactMarkdown>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {source && (
                      <span className="text-[10px] text-gray-400 dark:text-gray-600 select-none">{source}</span>
                    )}
                    {message.logId && (
                      <span className={`flex gap-1 ${message.rating ? "" : "opacity-0 group-hover/msg:opacity-100"} transition-opacity`}>
                        <button
                          onClick={() => rateMessage(message.logId!, "👍")}
                          className={`p-1 rounded transition-colors ${
                            message.rating === "👍"
                              ? "text-[#1515F5]"
                              : "text-gray-300 dark:text-gray-600 hover:text-[#1515F5]"
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={message.rating === "👍" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M7 10v12" />
                            <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => rateMessage(message.logId!, "👎")}
                          className={`p-1 rounded transition-colors ${
                            message.rating === "👎"
                              ? "text-gray-500"
                              : "text-gray-300 dark:text-gray-600 hover:text-gray-500"
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill={message.rating === "👎" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 14V2" />
                            <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                          </svg>
                        </button>
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ))}

        {hasUserMessages && flowPhase === "active" && currentFlowStep && !isLoading && (
          <div className="flex flex-wrap gap-2 ml-11 max-w-4xl mx-auto w-full">
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
          <div className="flex items-start gap-3 max-w-4xl mx-auto w-full">
            <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0" />
            <div className="flex space-x-2 pt-2">
              <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.1s]" />
              <div className="w-2 h-2 bg-e-indigo-light rounded-full animate-bounce [animation-delay:0.2s]" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {hasUserMessages && (
        <div className="border-t border-e-pale dark:border-gray-800 relative">
          {faqSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 z-10">
              <div className="max-w-4xl mx-auto px-4">
                <div className="bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 rounded-lg shadow-lg overflow-y-auto max-h-64">
                  {faqSuggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(suggestion)}
                      className="w-full text-left px-4 py-3 text-sm text-foreground hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors border-b border-[#ECECEC] dark:border-gray-700 last:border-b-0"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="p-4 max-w-4xl mx-auto w-full">
            <div className="flex gap-3 items-center">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("chat.placeholder")}
                className="flex-1 rounded-full border border-e-grey-light dark:border-gray-700 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-e-indigo-light bg-white dark:bg-gray-900"
              />
              <button
                type="submit"
                disabled={!input.trim()}
                className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-e-indigo-light text-white hover:bg-e-indigo disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}

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
