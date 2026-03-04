import ReactMarkdown from "react-markdown";
import type { Message } from "@/types/chat";
import type { UiLabels } from "@/lib/i18n/labels";

interface MessageBubbleProps {
  message: Message;
  index: number;
  onRate: (msgIndex: number, rating: "\u{1F44D}" | "\u{1F44E}", e?: React.MouseEvent) => void;
  onFaqClick: () => void;
  onAvatarClick: () => void;
  t: (key: keyof UiLabels) => string;
  kiosk?: boolean;
}

export default function MessageBubble({ message, index, onRate, onFaqClick, onAvatarClick, t, kiosk }: MessageBubbleProps) {
  return (
    <div
      key={index}
      className={`flex max-w-4xl mx-auto w-full ${message.role === "user" ? "justify-end animate-slide-in-right" : "justify-start items-start gap-3 animate-slide-in-left"}`}
    >
      {message.role === "assistant" && (
        <button onClick={onAvatarClick} aria-label="Who is Steward?" className="cursor-pointer shrink-0 mt-0.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/avatar.png" alt="Steward" className="w-8 h-8 rounded-full transition-transform duration-200 hover:scale-125" />
        </button>
      )}
      {message.role === "user" ? (
        <div className={`max-w-[70%] bg-[#1515F5] text-white px-4 py-3 rounded-2xl rounded-tr-sm ${kiosk ? "text-xl" : ""}`}>
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
        // Parse inline [link: url | label] or [link: label | url] tags
        const linkTagRegex = /\[link:\s*([^\]|]+?)\s*\|\s*([^\]]+)\]/gi;
        const inlineLinks: { url: string; label: string }[] = [];
        let linkMatch;
        while ((linkMatch = linkTagRegex.exec(bodyRaw)) !== null) {
          const a = linkMatch[1].trim();
          const b = linkMatch[2].trim();
          // Detect which part is the URL
          if (a.startsWith("http")) {
            inlineLinks.push({ url: a, label: b });
          } else if (b.startsWith("http")) {
            inlineLinks.push({ url: b, label: a });
          }
        }
        const body = bodyRaw.replace(linkTagRegex, "").trimEnd();
        return (
          <div className="max-w-[85%] group/msg">
          <div className="bg-white dark:bg-gray-900 px-4 py-3 rounded-2xl rounded-tl-sm text-foreground">
            <div className={`prose dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-headings:text-e-indigo ${kiosk ? "prose-xl" : ""} ${body.split("\n").length > 25 ? "max-h-[50vh] overflow-y-auto" : ""}`}>
              <ReactMarkdown components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-e-indigo underline hover:text-e-indigo-hover">{children}</a> }}>{body}</ReactMarkdown>
            </div>
            {inlineLinks.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3">
                {inlineLinks.map((link, i) => (
                  <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 bg-[#F7F7F7] dark:bg-gray-800 rounded-lg hover:bg-[#ECECEC] dark:hover:bg-gray-700 transition-colors cursor-pointer no-underline">
                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-[#1515F5]/10 text-[#1515F5] shrink-0">
                      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </div>
                    <span className="text-sm font-medium text-foreground truncate flex-1">{link.label}</span>
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey dark:text-gray-400 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                ))}
              </div>
            )}
            {source && (
              <div className="mt-3">
                {(source === "General Knowledge" || source === "Knowledge Base") && !sourceLabel ? (
                  <span className="text-[10px] text-e-grey dark:text-gray-400 select-none">{source}</span>
                ) : sourceUrl ? (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 w-full px-3 py-2.5 bg-[#F7F7F7] dark:bg-gray-800 rounded-xl hover:bg-[#ECECEC] dark:hover:bg-gray-700 transition-colors group/source cursor-pointer no-underline">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#1515F5]/10 text-[#1515F5] shrink-0">
                      <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{sourceLabel || source}</p>
                      <p className="text-xs text-e-grey dark:text-gray-400">{t("chat.sourceWebsite")}</p>
                    </div>
                    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-e-grey dark:text-gray-400 group-hover/source:text-[#1515F5] transition-colors shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </a>
                ) : source === "FAQ" ? (
                  <button onClick={onFaqClick} className="text-[10px] text-e-grey dark:text-gray-400 hover:text-e-indigo transition-colors cursor-pointer">
                    FAQ &middot; {t("chat.sourceFaq")}
                  </button>
                ) : (
                  <span className="text-[10px] text-e-grey dark:text-gray-400 select-none">{source}</span>
                )}
              </div>
            )}
          </div>
          <span className={`flex gap-1 mt-1 transition-opacity ${message.rating ? "" : "touch-visible opacity-0 delay-[1500ms] group-hover/msg:opacity-100 group-hover/msg:delay-0"}`}>
            <button
              aria-label="Helpful"
              onClick={(e) => onRate(index, "\u{1F44D}", e)}
              className={`p-1 rounded transition-colors cursor-pointer ${
                message.rating === "\u{1F44D}"
                  ? "bg-[#1515F5] text-white"
                  : "text-[#ABABAB] hover:text-[#828282]"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={message.rating === "\u{1F44D}" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M7 10v12" />
                <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" />
              </svg>
            </button>
            <button
              aria-label="Not helpful"
              onClick={() => onRate(index, "\u{1F44E}")}
              className={`p-1 rounded transition-colors cursor-pointer ${
                message.rating === "\u{1F44E}"
                  ? "bg-[#1515F5] text-white"
                  : "text-[#ABABAB] hover:text-[#828282]"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={message.rating === "\u{1F44E}" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 14V2" />
                <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" />
              </svg>
            </button>
          </span>
        </div>
        );
      })()}
    </div>
  );
}
