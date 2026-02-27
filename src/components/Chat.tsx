"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { useI18n } from "@/lib/i18n/context";
import type { UiLabels } from "@/lib/i18n/labels";
import FaqModal from "./FaqModal";

interface Message {
  role: "user" | "assistant";
  content: string;
  logId?: string;
  rating?: "👍" | "👎";
}

interface FlowOption {
  name: string;
  label: string;
  labelNl: string;
  labelDe: string;
  icon: string | null;
}

interface FlowStep {
  name: string;
  message: string;
  messageNl: string;
  messageDe: string;
  nextDialogFlow: FlowOption[];
  endAction: "Continue Flow" | "Start AI Chat";
  contextKey: string;
  endPrompt: string;
  endPromptNl: string;
  endPromptDe: string;
  relatedFaqQuestion: string;
  relatedFaqQuestionNl: string;
  relatedFaqQuestionDe: string;
  relatedFaqAnswer: string;
  relatedFaqAnswerNl: string;
  relatedFaqAnswerDe: string;
  relatedFaqUrl: string;
  order: number;
}

type FlowPhase = "loading" | "active" | "completed" | "skipped";

interface KbStatus {
  status: "synced" | "not_synced" | "loading";
  fileCount: number;
  fileNames: string[];
  lastSynced: string | null;
  faqCount?: number;
  websitePageCount?: number;
  user?: {
    email: string | null;
    roles: string[];
    folders: string[];
  };
  filteredFileCount?: number;
  filteredFileNames?: string[];
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
  const [shopifyUser, setShopifyUser] = useState<{ email: string; firstName: string; lastName: string; displayName: string } | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [kbStatus, setKbStatus] = useState<KbStatus | null>(null);
  const [kbExpanded, setKbExpanded] = useState(false);
  const [starters, setStarters] = useState<{ question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string }[]>([]);
  const [faqs, setFaqs] = useState<{ question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string; category: string; audience: string[]; url: string }[]>([]);
  const [showFaqModal, setShowFaqModal] = useState(false);
  const [phIndex, setPhIndex] = useState(0);
  const [phVisible, setPhVisible] = useState(true);
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("loading");
  const [flowContext, setFlowContext] = useState<Record<string, string>>({});
  const [currentFlowStep, setCurrentFlowStep] = useState<FlowStep | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "sharing" | "copied" | "error">("idle");
  const [langOpen, setLangOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID().slice(0, 8));
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const sharedChatIdRef = useRef(searchParams.get("chat"));
  const debugMode = searchParams.get("debug") === "true";
  const client = searchParams.get("client");
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
    // Fetch guided flows
    const isSharedChat = !!sharedChatIdRef.current;
    fetch("/api/guided-flows")
      .then((res) => res.json())
      .then((data: FlowStep[]) => {
        setFlowSteps(data);
        // Don't start welcome flow if loading a shared chat
        if (isSharedChat) return;
        if (data.length > 0) {
          const welcome = data.find((s) => s.name.toLowerCase() === "welcome");
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

  // Load shared chat from URL parameter
  const [pendingFlowStepName, setPendingFlowStepName] = useState<string | null>(null);

  useEffect(() => {
    const chatId = sharedChatIdRef.current;
    if (!chatId) return;

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
          // Save flow step name to restore once flowSteps are loaded
          if (data.flowPhase === "active" && data.currentFlowStepName) {
            setPendingFlowStepName(data.currentFlowStepName);
          } else {
            setFlowPhase("completed");
            setCurrentFlowStep(null);
          }
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
  }, []);

  // Restore flow state once both pendingFlowStepName and flowSteps are available
  useEffect(() => {
    if (!pendingFlowStepName || flowSteps.length === 0) return;
    const step = flowSteps.find((s) => s.name === pendingFlowStepName);
    if (step) {
      setCurrentFlowStep(step);
      setFlowPhase("active");
    } else {
      setFlowPhase("completed");
    }
    setPendingFlowStepName(null);
  }, [pendingFlowStepName, flowSteps]);

  // Check Shopify session on mount and when window regains focus (for iframe login flow)
  const checkSession = useCallback(() => {
    fetch("/api/auth/shopify/session")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && data.customer) {
          setShopifyUser(data.customer);
          setUserRoles(data.roles || []);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    checkSession();
    if (client === "briefing") {
      window.addEventListener("focus", checkSession);
      return () => window.removeEventListener("focus", checkSession);
    }
  }, [checkSession, client]);

  // Cycling multilingual placeholder for the initial empty state
  const cyclingPlaceholders = useMemo(() => [
    "Type your question in English...",
    "Stel je vraag in het Nederlands...",
    "Stelle deine Frage auf Deutsch...",
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

  const handleShopifyLogin = () => {
    if (window.self !== window.top) {
      window.open("/api/auth/shopify/login", "_blank");
    } else {
      window.location.href = "/api/auth/shopify/login";
    }
  };

  const handleShopifyLogout = async () => {
    await fetch("/api/auth/shopify/logout", { method: "POST" });
    setShopifyUser(null);
    setUserRoles([]);
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

  // Update flow messages when language changes
  useEffect(() => {
    if (flowPhase !== "active" || !currentFlowStep) return;
    // Only update if we're showing just the welcome message (no user messages yet)
    if (messages.length === 1 && messages[0].role === "assistant") {
      const translatedMsg = getFlowMessage(currentFlowStep);
      if (messages[0].content !== translatedMsg) {
        setMessages([{ role: "assistant", content: translatedMsg }]);
      }
    }
  }, [lang, flowPhase, currentFlowStep, getFlowMessage, messages]);

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
    // Check starters (match any language version) - starters don't have URLs
    const starter = starters.find((s) =>
      s.question.toLowerCase() === q ||
      s.questionNl.toLowerCase() === q ||
      s.questionDe.toLowerCase() === q
    );
    if (starter) { const a = getA(starter); if (a) return { answer: a, question: getQ(starter) }; }
    // Check all FAQs (match any language version)
    const faq = faqs.find((f) =>
      f.question.toLowerCase() === q ||
      f.questionNl.toLowerCase() === q ||
      f.questionDe.toLowerCase() === q
    );
    if (faq) { const a = getA(faq); if (a) return { answer: a, url: faq.url || undefined, question: getQ(faq) }; }
    return null;
  };

  const handleFlowOption = (stepName: string, displayLabel: string) => {
    if (!currentFlowStep) return;

    // Store the user's choice
    const newContext = { ...flowContext };
    if (currentFlowStep.contextKey) {
      newContext[currentFlowStep.contextKey] = displayLabel;
    }
    setFlowContext(newContext);

    // Add user's choice as a message
    const userMsg: Message = { role: "user", content: displayLabel };

    // Check if flow should end after this step
    if (currentFlowStep.endAction === "Start AI Chat") {
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      // If there's a linked FAQ, show the FAQ question and answer directly
      const faqQuestion = getFlowFaqQuestion(currentFlowStep);
      const faqAnswer = getFlowFaqAnswer(currentFlowStep);
      if (faqAnswer) {
        const faqUserMsg: Message = { role: "user", content: faqQuestion || displayLabel };
        const faqUrl = currentFlowStep.relatedFaqUrl;
        const faqTitle = currentFlowStep.relatedFaqQuestion || faqQuestion || displayLabel;
        const answerWithSource = faqUrl
          ? `${faqAnswer}\n\n[source: FAQ | ${faqUrl} | ${faqTitle}]`
          : `${faqAnswer}\n\n[source: FAQ | ${faqTitle}]`;
        const baseMessages = [...messages, faqUserMsg];
        setMessages(baseMessages);
        showWithThinkingDelay(baseMessages, answerWithSource);
        return;
      }
      // Otherwise use endPrompt with Gemini
      const prompt = getFlowEndPrompt(currentFlowStep);
      const updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
      if (prompt) {
        sendMessage(prompt, updatedMessages, true);
      }
      return;
    }

    // Find next step directly by name
    const nextStep = flowSteps.find((s) => s.name === stepName);
    if (!nextStep) {
      console.warn(`Flow step "${stepName}" not found, ending flow`);
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      setMessages((prev) => [...prev, userMsg]);
      return;
    }

    // If the next step immediately ends the flow, trigger its endPrompt or show FAQ
    if (nextStep.endAction === "Start AI Chat") {
      setFlowPhase("completed");
      setCurrentFlowStep(null);
      const nextMsg = getFlowMessage(nextStep);
      // If there's a linked FAQ, show the FAQ question and answer directly
      const faqQuestion = getFlowFaqQuestion(nextStep);
      const faqAnswer = getFlowFaqAnswer(nextStep);
      if (faqAnswer) {
        const faqUserMsg: Message = { role: "user", content: faqQuestion || displayLabel };
        const faqUrl = nextStep.relatedFaqUrl;
        const faqTitle = nextStep.relatedFaqQuestion || faqQuestion || displayLabel;
        const answerWithSource = faqUrl
          ? `${faqAnswer}\n\n[source: FAQ | ${faqUrl} | ${faqTitle}]`
          : `${faqAnswer}\n\n[source: FAQ | ${faqTitle}]`;
        const baseMessages = nextMsg
          ? [...messages, userMsg, { role: "assistant" as const, content: nextMsg }, faqUserMsg]
          : [...messages, faqUserMsg];
        setMessages(baseMessages);
        showWithThinkingDelay(baseMessages, answerWithSource);
        return;
      }
      // Otherwise use endPrompt with Gemini
      const prompt = getFlowEndPrompt(nextStep);
      if (prompt) {
        const updatedMessages = nextMsg
          ? [...messages, userMsg, { role: "assistant" as const, content: nextMsg }]
          : [...messages, userMsg];
        setMessages(updatedMessages);
        sendMessage(prompt, updatedMessages, true);
      } else if (nextMsg) {
        // No endPrompt — send the message itself through Gemini so it gets translated
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        sendMessage(`Relay this information to the user exactly as-is (translate to their language, keep all formatting and bullet points): ${nextMsg}`, updatedMessages, true);
      } else {
        setMessages([...messages, userMsg]);
      }
      return;
    }

    setCurrentFlowStep(nextStep);
    const baseMessages = [...messages, userMsg];
    setMessages(baseMessages);
    showWithThinkingDelay(baseMessages, getFlowMessage(nextStep));
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

  const rateMessage = useCallback((msgIndex: number, rating: "👍" | "👎") => {
    setMessages((prev) => {
      const msg = prev[msgIndex];
      if (!msg) return prev;

      // Optimistic UI update
      const updated = prev.map((m, i) => (i === msgIndex ? { ...m, rating } : m));

      if (msg.logId) {
        // Already logged — just update rating
        fetch(`/api/chat/log/${encodeURIComponent(msg.logId)}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating }),
        }).catch(() => {});
      } else {
        // Not yet logged — find the preceding user message and log first
        let question = "";
        for (let i = msgIndex - 1; i >= 0; i--) {
          if (prev[i].role === "user") { question = prev[i].content; break; }
        }
        const sourceMatch = msg.content.match(/\[source:\s*(.+?)\]\s*$/i);
        const source = sourceMatch?.[1] || null;
        fetch("/api/chat/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, answer: msg.content, source, lang, sessionId }),
        })
          .then((res) => res.ok ? res.json() : null)
          .then((data) => {
            if (data?.logId) {
              setMessages((p) =>
                p.map((m, i) => i === msgIndex ? { ...m, logId: data.logId } : m)
              );
              fetch(`/api/chat/log/${encodeURIComponent(data.logId)}/rate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rating }),
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      return updated;
    });
  }, [lang, sessionId]);

  const sendMessage = async (text: string, baseMessages?: Message[], hidden = false) => {
    if (!text.trim()) return;

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // If user types during active flow, end flow gracefully
    // and clear the welcome message so the user's question appears at the top
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
    // API always sees the prompt; UI only shows it when not hidden
    const apiMessages = [...base, userMessage];
    const displayMessages = hidden ? base : apiMessages;
    setMessages(displayMessages);
    setInput("");

    // Instant answer from FAQ/starter — skip for hidden prompts
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

    // No instant match — ask Gemini
    setIsLoading(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages, lang: lang || "en", flowContext }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json();
        setMessages([
          ...displayMessages,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
        return;
      }

      // Stream NDJSON response
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
            if (msg.type === "chunk") {
              accumulated += msg.text;
              setMessages([...displayMessages, { role: "assistant", content: accumulated }]);
            } else if (msg.type === "done") {
              // Apply source post-processing
              if (msg.source) {
                accumulated = accumulated.replace(
                  /\[source:\s*(?:Website|FAQ|Products?)\s*(?:\|[^\]]*)?\]/i,
                  msg.source
                );
                setMessages([...displayMessages, { role: "assistant", content: accumulated }]);
              }
              logChat(text, accumulated);
              // Handle language changes
              if (msg.lang) {
                if (msg.translations) {
                  setTranslations(msg.lang, msg.translations as UiLabels);
                } else if (msg.lang === "en") {
                  resetLanguage();
                }
              }
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

      // If no chunks arrived at all, show error
      if (!accumulated) {
        setMessages([
          ...displayMessages,
          { role: "assistant", content: t("chat.error") },
        ]);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // Request was aborted by a new message — don't show error
        return;
      }
      setMessages([
        ...displayMessages,
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

  const handleFaqSelect = (question: string) => {
    setShowFaqModal(false);
    sendMessage(question);
  };

  const handleNewChat = () => {
    if (messages.length === 0) return;
    setInput("");
    setFlowContext({});
    const welcome = flowSteps.find((s) => s.name.toLowerCase() === "welcome");
    if (welcome) {
      setCurrentFlowStep(welcome);
      setFlowPhase("active");
      setMessages([{ role: "assistant", content: getFlowMessage(welcome) }]);
    } else {
      setCurrentFlowStep(null);
      setFlowPhase("skipped");
      setMessages([]);
    }
    inputRef.current?.focus();
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
      await navigator.clipboard.writeText(url.toString());
      setShareStatus("copied");
      setTimeout(() => setShareStatus("idle"), 3000);
    } catch {
      setShareStatus("error");
      setTimeout(() => setShareStatus("idle"), 3000);
    }
  };



  // Fuzzy search: match FAQ questions when user types 2+ characters
  const hasUserMessages = useMemo(() => messages.some((m) => m.role === "user"), [messages]);

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

  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedSuggestion(-1);
  }, [faqSuggestions]);

  // Update page title with last user question (improves share previews)
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

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
    } else if (e.key === "Enter" && selectedSuggestion >= 0) {
      e.preventDefault();
      sendMessage(faqSuggestions[selectedSuggestion]);
    } else if (e.key === "Escape") {
      setSelectedSuggestion(-1);
    }
  };


  return (
    <div className="flex flex-col h-screen">
      <header className={`flex items-center ${client === "briefing" ? "justify-end" : "justify-between"} p-4 border-b border-e-pale dark:border-gray-800`}>
        {client !== "briefing" && <div>
          <h1 className="text-2xl font-extrabold text-e-indigo cursor-pointer" onClick={handleNewChat}>Steward <span className="hidden min-[900px]:inline text-sm font-normal text-e-grey">E-Flight Academy Virtual Assistant</span></h1>
        </div>}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowFaqModal(true)}
            title="FAQ"
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            <span className="hidden sm:inline text-sm">FAQ</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setLangOpen(!langOpen)}
              className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#F7F7F7] text-[#828282] text-sm font-medium hover:bg-[#ECECEC] transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 cursor-pointer"
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
                      className={`w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer ${
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
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
          {shopifyUser ? (
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="hidden sm:inline text-sm">{shopifyUser.firstName || shopifyUser.email}</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden sm:inline">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute top-full mt-2 right-0 bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 rounded-lg shadow-lg z-20 min-w-[220px] py-3">
                    <div className="px-4 pb-3 border-b border-[#ECECEC] dark:border-gray-700">
                      <div className="text-sm font-semibold text-[#4A4A4A] dark:text-gray-200">{shopifyUser.displayName || `${shopifyUser.firstName} ${shopifyUser.lastName}`.trim()}</div>
                      <div className="text-xs text-e-grey mt-0.5">{shopifyUser.email}</div>
                      <div className="text-xs text-e-indigo mt-1">{displayRole}</div>
                    </div>
                    <div className="pt-1">
                      <a
                        href="https://account.eflight.nl"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-[#4A4A4A] dark:text-gray-300 hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        {t("header.myAccount")}
                      </a>
                      <button
                        onClick={() => { setUserMenuOpen(false); handleShopifyLogout(); }}
                        className="flex items-center gap-3 w-full px-4 py-2 text-sm text-[#4A4A4A] dark:text-gray-300 hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        {t("header.logout")}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              onClick={handleShopifyLogin}
              title={t("header.login")}
              className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span className="hidden sm:inline text-sm">{t("header.login")}</span>
            </button>
          )}
        </div>
      </header>

      <div className={`flex-1 overflow-y-auto p-2 sm:p-4 bg-gradient-to-b from-[#EFEFEF] to-[#F7F7F7] dark:from-gray-950 dark:to-gray-900 ${hasUserMessages ? "space-y-6" : `flex flex-col items-center ${client === "briefing" ? "justify-end pb-4" : "justify-center"}`}`}>
        {!hasUserMessages && (
          <div className="w-full max-w-2xl px-1 sm:px-4 space-y-3 sm:space-y-6">
            {/* Skeleton loader for welcome message */}
            {flowPhase === "loading" && (
              <div className="flex justify-start items-start gap-3 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-[#E0E0E0] shrink-0 mt-0.5" />
                <div className="max-w-[85%] bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-tl-sm">
                  <div className="space-y-2">
                    <div className="h-4 bg-[#E0E0E0] rounded w-64" />
                    <div className="h-4 bg-[#E0E0E0] rounded w-48" />
                  </div>
                </div>
              </div>
            )}

            {/* Skeleton loader for flow buttons */}
            {flowPhase === "loading" && (
              <div className="flex flex-wrap gap-2 ml-11 animate-pulse">
                <div className="h-10 bg-[#E0E0E0] rounded-full w-32" />
                <div className="h-10 bg-[#E0E0E0] rounded-full w-40" />
                <div className="h-10 bg-[#E0E0E0] rounded-full w-28" />
              </div>
            )}

            {/* Flow dialog (welcome message + options) — shown above input */}
            {flowPhase !== "loading" && messages.map((message, index) => (
              <div
                key={index}
                className="flex justify-start items-start gap-3"
              >
                <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 mt-0.5 transition-transform duration-200 hover:scale-150" />
                <div className="max-w-[85%] bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-tl-sm text-foreground">
                  <div className="prose dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
                    <ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-e-indigo underline hover:text-e-indigo-hover">{children}</a> }}>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {flowPhase === "active" && currentFlowStep && !isLoading && (
              <div className="flex flex-wrap gap-2 ml-11">
                {(currentFlowStep.nextDialogFlow || []).map((option, i) => (
                  <button
                    key={i}
                    onClick={() => handleFlowOption(option.name, getFlowLabel(option))}
                    className="text-base font-semibold px-4 py-2 rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {option.icon && (
                      option.icon.startsWith("http") ? (
                        <img src={option.icon} alt="" className="w-5 h-5" />
                      ) : (
                        <span>{option.icon}</span>
                      )
                    )}
                    {getFlowLabel(option)}
                  </button>
                ))}
              </div>
            )}

            {/* Skeleton loader for suggested questions */}
            {starters.length === 0 && flowPhase === "loading" && (
              <div className="max-w-[56rem] mx-auto px-2 sm:px-6 py-2 sm:py-4 animate-pulse">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 bg-[#E0E0E0] rounded-full" />
                  <div className="h-4 bg-[#E0E0E0] rounded w-32" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="h-9 bg-[#E0E0E0] rounded-full w-48" />
                  <div className="h-9 bg-[#E0E0E0] rounded-full w-56" />
                  <div className="h-9 bg-[#E0E0E0] rounded-full w-40" />
                  <div className="h-9 bg-[#E0E0E0] rounded-full w-44" />
                  <div className="h-9 bg-[#E0E0E0] rounded-full w-36" />
                </div>
              </div>
            )}

            {/* Suggested questions */}
            {starters.length > 0 && (
              <div className="max-w-[56rem] mx-auto px-2 sm:px-6 py-2 sm:py-4">
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
                        className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer"
                      >
                        {displayText}
                      </button>
                    );
                  })}
                  {faqs.length > 0 && (
                    <button
                      onClick={() => setShowFaqModal(true)}
                      className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer"
                    >
                      More FAQ&apos;s
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Centered input with FAQ suggestions */}
            <form onSubmit={handleSubmit}>
              <div className="flex gap-3 items-end">
                <div className="relative flex-1">
                  {faqSuggestions.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 border-b-0 rounded-t-2xl overflow-y-auto max-h-64">
                      {faqSuggestions.map((suggestion, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => sendMessage(suggestion)}
                          className={`w-full text-left px-5 py-3 text-sm text-foreground hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors border-b border-[#ECECEC] dark:border-gray-700 cursor-pointer flex items-center gap-3 ${i === selectedSuggestion ? "bg-[#F7F7F7] dark:bg-gray-800" : ""}`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey shrink-0">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    name="message"
                    id="message-input"
                    autoComplete="off"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={undefined}
                    className={`w-full border border-e-grey-light dark:border-gray-700 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-e-indigo-light bg-white dark:bg-gray-900 ${faqSuggestions.length > 0 ? "rounded-b-2xl rounded-t-none" : "rounded-full"}`}
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
                  className="w-11 h-11 shrink-0 flex items-center justify-center rounded-full bg-e-indigo-light text-white hover:bg-e-indigo disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
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
              <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 mt-0.5 transition-transform duration-200 hover:scale-150" />
            )}
            {message.role === "user" ? (
              <div className="max-w-[70%] bg-[#1515F5] text-white px-4 py-3 rounded-2xl rounded-tr-sm">
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
              </div>
            ) : (() => {
              const sourceMatch = message.content.match(/\n?\[source:\s*(.+?)\]\s*$/i);
              const bodyRaw = sourceMatch ? message.content.slice(0, sourceMatch.index).trimEnd() : message.content;
              const sourceRaw = sourceMatch?.[1] || "";
              const sourceParts = sourceRaw.split("|").map((s) => s.trim());
              const source = sourceParts[0] || null;
              const sourceUrl = sourceParts[1] && sourceParts[1].startsWith("http") ? sourceParts[1] : null;
              const sourceLabel = sourceParts.length >= 3 ? sourceParts[2] : (sourceParts[1] && !sourceParts[1].startsWith("http") ? sourceParts[1] : null);
              // Parse inline [link: url | label] tags
              const linkTagRegex = /\[link:\s*(https?:\/\/[^\s|]+)\s*\|\s*([^\]]+)\]/gi;
              const inlineLinks: { url: string; label: string }[] = [];
              let linkMatch;
              while ((linkMatch = linkTagRegex.exec(bodyRaw)) !== null) {
                inlineLinks.push({ url: linkMatch[1].trim(), label: linkMatch[2].trim() });
              }
              const body = bodyRaw.replace(linkTagRegex, "").trimEnd();
              return (
                <div className="max-w-[85%] bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-tl-sm text-foreground group/msg">
                  <div className="prose dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
                    <ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-e-indigo underline hover:text-e-indigo-hover">{children}</a> }}>{body}</ReactMarkdown>
                  </div>
                  {inlineLinks.length > 0 && (
                    <div className="flex flex-col gap-1.5 mt-3">
                      {inlineLinks.map((link, i) => (
                        <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 bg-[#F7F7F7] dark:bg-gray-800 rounded-lg hover:bg-[#ECECEC] dark:hover:bg-gray-700 transition-colors cursor-pointer no-underline">
                          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#1515F5]/10 text-[#1515F5] shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </div>
                          <span className="text-sm font-medium text-foreground truncate flex-1">{link.label}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey dark:text-gray-400 shrink-0">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </a>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3">
                    {source && (source === "General Knowledge" || source === "Knowledge Base") && !sourceLabel ? (
                      <span className="text-[10px] text-e-grey dark:text-gray-400 select-none">{source}</span>
                    ) : source && (
                      sourceUrl ? (
                        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 w-full px-3 py-2.5 bg-[#F7F7F7] dark:bg-gray-800 rounded-xl hover:bg-[#ECECEC] dark:hover:bg-gray-700 transition-colors group/source cursor-pointer no-underline">
                          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1515F5]/10 text-[#1515F5] shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{sourceLabel || source}</p>
                            <p className="text-xs text-e-grey dark:text-gray-400">{t("chat.sourceWebsite")}</p>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey dark:text-gray-400 group-hover/source:text-[#1515F5] transition-colors shrink-0">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </a>
                      ) : source === "FAQ" ? (
                        <button onClick={() => setShowFaqModal(true)} className="text-[10px] text-e-grey dark:text-gray-400 hover:text-e-indigo transition-colors cursor-pointer">
                          FAQ · {t("chat.sourceFaq")}
                        </button>
                      ) : (
                        <span className="text-[10px] text-e-grey dark:text-gray-400 select-none">{source}</span>
                      )
                    )}
                    <span className={`flex gap-2 transition-opacity ${message.rating ? "" : "touch-visible opacity-0 group-hover/msg:opacity-100"}`}>
                      <button
                        onClick={() => rateMessage(index, "👍")}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          message.rating === "👍"
                            ? "bg-[#1515F5] text-white"
                            : "bg-[#F7F7F7] text-[#828282] hover:bg-[#ECECEC]"
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={message.rating === "👍" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 10v12" />
                          <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => rateMessage(index, "👎")}
                        className={`p-1.5 rounded transition-colors cursor-pointer ${
                          message.rating === "👎"
                            ? "bg-[#1515F5] text-white"
                            : "bg-[#F7F7F7] text-[#828282] hover:bg-[#ECECEC]"
                        }`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill={message.rating === "👎" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 14V2" />
                          <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
                        </svg>
                      </button>
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        ))}

        {hasUserMessages && flowPhase === "active" && currentFlowStep && !isLoading && (
          <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
            {(currentFlowStep.nextDialogFlow || []).map((option, i) => (
              <button
                key={i}
                onClick={() => handleFlowOption(option.name, getFlowLabel(option))}
                className="text-base font-semibold px-4 py-2 rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                {option.icon && (
                  option.icon.startsWith("http") ? (
                    <img src={option.icon} alt="" className="w-5 h-5" />
                  ) : (
                    <span>{option.icon}</span>
                  )
                )}
                {getFlowLabel(option)}
              </button>
            ))}
          </div>
        )}

        {isLoading && (
          <div className="flex items-start gap-3 max-w-4xl mx-auto w-full">
            <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full shrink-0 transition-transform duration-200 hover:scale-150" />
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
          <form onSubmit={handleSubmit} className="p-4 max-w-4xl mx-auto w-full">
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                {faqSuggestions.length > 0 && (
                  <div className="bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 border-b-0 rounded-t-2xl overflow-y-auto max-h-64">
                    {faqSuggestions.map((suggestion, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => sendMessage(suggestion)}
                        className={`w-full text-left px-5 py-3 text-sm text-foreground hover:bg-[#F7F7F7] dark:hover:bg-gray-800 transition-colors border-b border-[#ECECEC] dark:border-gray-700 cursor-pointer flex items-center gap-3 ${i === selectedSuggestion ? "bg-[#F7F7F7] dark:bg-gray-800" : ""}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey shrink-0">
                          <circle cx="11" cy="11" r="8" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  ref={inputRef}
                  type="text"
                  name="message"
                  id="message-input-bottom"
                  autoComplete="off"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder={t("chat.placeholder")}
                  className={`w-full border border-e-grey-light dark:border-gray-700 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-e-indigo-light bg-white dark:bg-gray-900 ${faqSuggestions.length > 0 ? "rounded-b-2xl rounded-t-none" : "rounded-full"}`}
                />
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

      {/* Knowledge base status bar - only visible with ?debug=true */}
      {debugMode && (
      <div className="border-t border-e-pale dark:border-gray-800">
        <button
          onClick={() => setKbExpanded(!kbExpanded)}
          className="w-full px-4 py-2 flex items-center justify-center gap-2 text-xs text-e-grey hover:bg-e-pale-light dark:hover:bg-gray-900 transition-colors cursor-pointer"
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
              {kbStatus.user?.email ? kbStatus.user.email : "Not logged in"}
              {kbStatus.user?.roles && kbStatus.user.roles.length > 0 && <> &middot; {kbStatus.user.roles.join(", ")}</>}
              {" "}&middot; Folders: {kbStatus.user?.folders?.join(", ") || "public"}
              {" "}&middot; {kbStatus.filteredFileCount ?? kbStatus.fileCount} docs
              {kbStatus.faqCount != null && <> &middot; {kbStatus.faqCount} FAQs</>}
              {kbStatus.websitePageCount != null && <> &middot; {kbStatus.websitePageCount} pages</>}
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
              {(kbStatus.filteredFileNames ?? kbStatus.fileNames).map((name, i) => (
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

        <button
          className="w-full px-4 pb-1 text-[10px] text-e-grey-light text-center cursor-pointer hover:text-e-grey transition-colors"
          onClick={() => {
            const version = `v${process.env.NEXT_PUBLIC_VERSION} (${process.env.NEXT_PUBLIC_BUILD_ID})`;
            navigator.clipboard.writeText(version);
            const el = document.getElementById("version-label");
            if (el) {
              const original = el.textContent;
              el.textContent = "Copied!";
              setTimeout(() => { el.textContent = original; }, 1500);
            }
          }}
        >
          <span id="version-label">v{process.env.NEXT_PUBLIC_VERSION} ({process.env.NEXT_PUBLIC_BUILD_ID})</span>
        </button>
      </div>
      )}

      {showFaqModal && (
        <FaqModal
          faqs={faqs}
          lang={lang}
          onClose={() => setShowFaqModal(false)}
          onSelectFaq={handleFaqSelect}
        />
      )}
    </div>
  );
}
