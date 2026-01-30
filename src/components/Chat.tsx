"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [kbStatus, setKbStatus] = useState<KbStatus | null>(null);
  const [kbExpanded, setKbExpanded] = useState(false);
  const [starters, setStarters] = useState<{ question: string; answer: string }[]>([]);
  const [faqQuestions, setFaqQuestions] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
        .then((data) => setFaqQuestions(data))
        .catch(() => {});
    }
    return () => stopPolling();
  }, [isAuthenticated, fetchKbStatus, startPolling, stopPolling]);

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
        setAuthError("Incorrect password");
      }
    } catch {
      setAuthError("Failed to connect to the server.");
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: text };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessages([...newMessages, { role: "assistant", content: data.message }]);
      } else {
        setMessages([
          ...newMessages,
          { role: "assistant", content: `Error: ${data.error}` },
        ]);
      }
    } catch {
      setMessages([
        ...newMessages,
        { role: "assistant", content: "Failed to connect to the server." },
      ]);
    } finally {
      setIsLoading(false);
      fetchKbStatus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Fuzzy search: match FAQ questions when user types 2+ characters
  const faqSuggestions = useMemo(() => {
    const query = input.trim().toLowerCase();
    if (query.length < 2 || messages.length > 0) return [];
    // Check if input matches a starter exactly (user clicked a starter)
    if (starters.some((s) => s.question === input)) return [];
    return faqQuestions
      .filter((q) => {
        const lower = q.toLowerCase();
        // Match if any word in the question starts with the query,
        // or if the query appears as a substring
        return lower.includes(query) ||
          lower.split(/\s+/).some((word) => word.startsWith(query));
      })
      .slice(0, 5);
  }, [input, faqQuestions, messages.length, starters]);

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center h-screen">
        <form onSubmit={handleLogin} className="w-full max-w-sm p-8">
          <h1 className="text-xl font-extrabold text-e-indigo text-center mb-2">E-Flight Virtual Ops</h1>
          <p className="text-sm text-e-grey text-center mb-6">Enter password to continue</p>
          {authError && (
            <p className="text-red-500 text-sm text-center mb-4">{authError}</p>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-e-grey-light dark:border-gray-700 px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-e-indigo bg-white dark:bg-gray-900"
            autoFocus
          />
          <button
            type="submit"
            disabled={!password}
            className="w-full px-6 py-2 bg-e-indigo text-white rounded-lg hover:bg-e-indigo-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Log in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      <header className="flex items-center justify-between p-4 border-b border-e-pale dark:border-gray-800">
        <div className="w-10" />
        <div className="text-center">
          <h1 className="text-xl font-extrabold text-e-indigo">E-Flight Virtual Ops</h1>
          <p className="text-sm text-e-grey">Your AI assistant for flight training questions</p>
        </div>
        <button
          onClick={() => {
            setIsAuthenticated(false);
            setPassword("");
            setMessages([]);
            setKbStatus(null);
            setKbExpanded(false);
            setFaqQuestions([]);
          }}
          title="Log out"
          className="w-10 h-10 flex items-center justify-center rounded-lg text-e-grey hover:bg-e-pale dark:hover:bg-gray-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-e-grey mt-8">
            <p>Welcome to E-Flight Virtual Ops!</p>
            <p className="text-sm mt-2">Ask me anything about flight training, scheduling, or academy operations.</p>
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
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
                  <ReactMarkdown>{message.content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        ))}

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
        {messages.length === 0 && starters.length > 0 && (
          <div className="px-4 pt-3 flex flex-wrap gap-2">
            {starters.map((starter, i) => (
              <button
                key={i}
                onClick={() => sendMessage(starter.question)}
                className="text-sm px-3 py-1.5 rounded-full border border-e-indigo-light text-e-indigo hover:bg-e-indigo hover:text-white transition-colors"
              >
                {starter.question}
              </button>
            ))}
          </div>
        )}
        {faqSuggestions.length > 0 && (
          <div className="px-4 pt-2 flex flex-wrap gap-2">
            {faqSuggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => sendMessage(suggestion)}
                className="text-left text-sm px-3 py-1.5 rounded-full border border-e-indigo-light text-e-indigo hover:bg-e-indigo hover:text-white transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={handleSubmit} className="p-4">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 rounded-lg border border-e-grey-light dark:border-gray-700 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-e-indigo bg-white dark:bg-gray-900"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="px-6 py-2 bg-e-indigo text-white rounded-lg hover:bg-e-indigo-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Send
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
              Knowledge base &middot; {kbStatus.fileCount} files
              {kbStatus.faqCount != null && <> &middot; {kbStatus.faqCount} FAQs</>}
              {kbStatus.lastSynced && <> &middot; Synced {timeAgo(kbStatus.lastSynced)}</>}
            </span>
          ) : kbStatus?.status === "loading" ? (
            <span>Knowledge base &middot; Loading documents...</span>
          ) : (
            <span>Knowledge base &middot; Not synced yet</span>
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
              Loading documents from Google Drive. This may take a moment...
            </p>
          </div>
        )}

        {kbExpanded && kbStatus?.status === "not_synced" && (
          <div className="px-4 pb-3">
            <p className="text-xs text-e-grey">
              Documents will be loaded from Google Drive on the first chat message.
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
