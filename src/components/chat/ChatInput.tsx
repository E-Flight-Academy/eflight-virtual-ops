import React from "react";

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  faqSuggestions: string[];
  selectedSuggestion: number;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  sendAnimating: boolean;
  placeholder?: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  autoResizeTextarea: () => void;
  onFaqSelect: (suggestion: string) => void;
  centered?: boolean;
  cyclingPlaceholders?: string[];
  phIndex?: number;
  phVisible?: boolean;
}

export default function ChatInput({
  input,
  setInput,
  onSubmit,
  faqSuggestions,
  selectedSuggestion,
  onKeyDown,
  sendAnimating,
  placeholder,
  inputRef,
  autoResizeTextarea,
  onFaqSelect,
  centered,
  cyclingPlaceholders,
  phIndex,
  phVisible,
}: ChatInputProps) {
  const inputId = centered ? "message-input" : "message-input-bottom";

  return (
    <form onSubmit={onSubmit} className={centered ? undefined : "p-4 max-w-4xl mx-auto w-full"}>
      <div className="flex gap-2 items-end">
        <div className="relative flex-1 flex flex-col">
          {faqSuggestions.length > 0 && (
            <div role="listbox" className="bg-white dark:bg-gray-900 border border-[#ECECEC] dark:border-gray-700 border-b-0 rounded-t-2xl overflow-y-auto max-h-64">
              {faqSuggestions.map((suggestion, i) => (
                <button
                  key={i}
                  type="button"
                  role="option"
                  aria-selected={i === selectedSuggestion}
                  onClick={() => onFaqSelect(suggestion)}
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
          <textarea
            ref={inputRef}
            name="message"
            id={inputId}
            autoComplete="off"
            rows={1}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoResizeTextarea(); }}
            onKeyDown={onKeyDown}
            placeholder={centered ? undefined : placeholder}
            className={`w-full border border-e-grey-light dark:border-gray-700 px-5 py-3 focus:outline-none focus:ring-2 focus:ring-e-indigo-light bg-white dark:bg-gray-900 resize-none leading-6 ${faqSuggestions.length > 0 ? "rounded-b-2xl rounded-t-none" : "rounded-3xl"}`}
          />
          {centered && !input && cyclingPlaceholders && phIndex !== undefined && phVisible !== undefined && (
            <span
              className={`absolute left-5 top-3 pointer-events-none text-gray-400 leading-6 transition-opacity duration-400 ${phVisible ? "opacity-70" : "opacity-0"}`}
            >
              {cyclingPlaceholders[phIndex]}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!input.trim()}
          aria-label="Send message"
          className={`w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-e-indigo-light text-white hover:bg-e-indigo disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors ${sendAnimating ? "animate-send-pulse" : ""}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </form>
  );
}
