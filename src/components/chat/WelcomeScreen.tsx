import React from "react";
import ReactMarkdown from "react-markdown";
import type { Message, FlowStep, FlowPhase, FlowOption } from "@/types/chat";
import FlowOptions from "./FlowOptions";
import ChatInput from "./ChatInput";

interface WelcomeScreenProps {
  flowPhase: FlowPhase;
  messages: Message[];
  currentFlowStep: FlowStep | null;
  isLoading: boolean;
  handleFlowOption: (stepName: string, displayLabel: string) => void;
  getFlowLabel: (option: FlowOption) => string;
  starters: { question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string }[];
  faqs: { question: string; questionNl: string; questionDe: string; answer: string; answerNl: string; answerDe: string; category: string; audience: string[]; url: string }[];
  getQ: (item: { question: string; questionNl: string; questionDe: string }) => string;
  sendMessage: (text: string) => void;
  onFaqOpen: () => void;
  onAvatarClick: () => void;
  // ChatInput props
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  faqSuggestions: string[];
  selectedSuggestion: number;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  sendAnimating: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  autoResizeTextarea: () => void;
  onFaqSelect: (suggestion: string) => void;
  cyclingPlaceholders: string[];
  phIndex: number;
  phVisible: boolean;
}

export default function WelcomeScreen({
  flowPhase,
  messages,
  currentFlowStep,
  isLoading,
  handleFlowOption,
  getFlowLabel,
  starters,
  faqs,
  getQ,
  sendMessage,
  onFaqOpen,
  onAvatarClick,
  input,
  setInput,
  onSubmit,
  faqSuggestions,
  selectedSuggestion,
  onKeyDown,
  sendAnimating,
  inputRef,
  autoResizeTextarea,
  onFaqSelect,
  cyclingPlaceholders,
  phIndex,
  phVisible,
}: WelcomeScreenProps) {
  return (
    <div className="w-full max-w-2xl px-1 sm:px-4 space-y-3 sm:space-y-6">
      {/* Skeleton loader for welcome message */}
      {flowPhase === "loading" && (
        <div aria-busy="true" className="flex justify-start items-start gap-3 animate-pulse">
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
        <div aria-busy="true" className="flex flex-wrap gap-2 ml-11 animate-pulse">
          <div className="h-10 bg-[#E0E0E0] rounded-full w-32" />
          <div className="h-10 bg-[#E0E0E0] rounded-full w-40" />
          <div className="h-10 bg-[#E0E0E0] rounded-full w-28" />
        </div>
      )}

      {/* Flow dialog (welcome message + options) — shown above input */}
      {flowPhase !== "loading" && messages.map((message, index) => (
        <div
          key={index}
          className="flex justify-start items-start gap-3 animate-fade-in-up"
          style={{ animationDelay: `${index * 150}ms` }}
        >
          <button onClick={onAvatarClick} aria-label="Who is Steward?" className="cursor-pointer shrink-0 mt-0.5">
            <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full transition-transform duration-200 hover:scale-125" />
          </button>
          <div className="max-w-[85%] bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-tl-sm text-foreground">
            <div className="prose dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo">
              <ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-e-indigo underline hover:text-e-indigo-hover">{children}</a> }}>{message.content}</ReactMarkdown>
            </div>
          </div>
        </div>
      ))}

      {flowPhase === "active" && currentFlowStep && !isLoading && (
        <div className="flex flex-wrap gap-2 ml-11 animate-fade-in-up">
          <FlowOptions
            options={currentFlowStep.nextDialogFlow || []}
            onSelect={handleFlowOption}
            getFlowLabel={getFlowLabel}
          />
        </div>
      )}

      {/* Skeleton loader for suggested questions */}
      {starters.length === 0 && flowPhase === "loading" && (
        <div aria-busy="true" className="max-w-[56rem] mx-auto px-2 sm:px-6 py-2 sm:py-4 animate-pulse">
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
        <div className="max-w-[56rem] mx-auto px-2 sm:px-6 py-2 sm:py-4 animate-fade-in-up">
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
                onClick={onFaqOpen}
                className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 cursor-pointer"
              >
                More FAQ&apos;s
              </button>
            )}
          </div>
        </div>
      )}

      {/* Centered input with FAQ suggestions */}
      <ChatInput
        input={input}
        setInput={setInput}
        onSubmit={onSubmit}
        faqSuggestions={faqSuggestions}
        selectedSuggestion={selectedSuggestion}
        onKeyDown={onKeyDown}
        sendAnimating={sendAnimating}
        inputRef={inputRef}
        autoResizeTextarea={autoResizeTextarea}
        onFaqSelect={onFaqSelect}
        centered
        cyclingPlaceholders={cyclingPlaceholders}
        phIndex={phIndex}
        phVisible={phVisible}
      />
    </div>
  );
}
