"use client";

import React from "react";
import type { Message, FlowOption, FlowStep } from "@/types/chat";
import type { UiLabels } from "@/lib/i18n/labels";
import type { FaqAdminPhase, FaqAdminAction } from "@/hooks/useFaqAdmin";
import MessageBubble from "./MessageBubble";
import FlowOptions from "./FlowOptions";
import FeedbackFollowUp from "./FeedbackFollowUp";
import FollowUpSuggestions from "./FollowUpSuggestions";
import TypingIndicator from "./TypingIndicator";

interface MessageListProps {
  messages: Message[];
  onRate: (msgIndex: number, rating: "\u{1F44D}" | "\u{1F44E}", e?: React.MouseEvent) => void;
  onFaqClick: () => void;
  onAvatarClick: () => void;
  flowPhase: string;
  currentFlowStep: FlowStep | null;
  isLoading: boolean;
  handleFlowOption: (stepName: string, displayLabel: string) => void;
  getFlowLabel: (option: FlowOption) => string;
  feedbackFollowUpLogId: string | null;
  setFeedbackFollowUpLogId: (v: string | null) => void;
  setFeedbackContactLogId: (v: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  shopifyUser: { email: string; firstName: string; lastName: string; displayName: string } | null;
  followUpSuggestions: string[];
  onFollowUpSelect: (s: string) => void;
  t: (key: keyof UiLabels) => string;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  kiosk?: boolean;
  adminPhase?: FaqAdminPhase;
  onAdminAction?: (action: FaqAdminAction) => void;
  onAdminApply?: () => void;
  onAdminCancel?: () => void;
  onAdminRevise?: () => void;
  onAdminInput?: (text: string) => void;
  adminCategories?: string[];
  adminAudiences?: string[];
  lang?: string;
}

export default function MessageList({
  messages,
  onRate,
  onFaqClick,
  onAvatarClick,
  flowPhase,
  currentFlowStep,
  isLoading,
  handleFlowOption,
  getFlowLabel,
  feedbackFollowUpLogId,
  setFeedbackFollowUpLogId,
  setFeedbackContactLogId,
  setMessages,
  shopifyUser,
  followUpSuggestions,
  onFollowUpSelect,
  t,
  messagesEndRef,
  kiosk,
  adminPhase,
  onAdminAction,
  onAdminApply,
  onAdminCancel,
  onAdminRevise,
  onAdminInput,
  adminCategories = [],
  adminAudiences = [],
  lang = "en",
}: MessageListProps) {
  return (
    <div role="log" aria-live="polite" aria-label="Chat messages" className="space-y-4">
      {messages.map((message, index) => (
        <MessageBubble
          key={index}
          message={message}
          index={index}
          onRate={onRate}
          onFaqClick={onFaqClick}
          onAvatarClick={onAvatarClick}
          t={t}
          kiosk={kiosk}
        />
      ))}

      {adminPhase === "choose-action" && onAdminAction && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          {([
            { action: "add" as FaqAdminAction, label: { en: "+ Add", nl: "+ Toevoegen", de: "+ Hinzufügen" } },
            { action: "edit" as FaqAdminAction, label: { en: "Edit", nl: "Bewerken", de: "Bearbeiten" } },
            { action: "delete" as FaqAdminAction, label: { en: "Delete", nl: "Verwijderen", de: "Löschen" } },
          ]).map((item, i) => (
            <button
              key={item.action}
              onClick={() => onAdminAction(item.action)}
              className={`text-sm px-4 py-2 rounded-full border transition-colors cursor-pointer animate-pop-in ${
                item.action === "delete"
                  ? "border-red-200 text-red-600 bg-white hover:bg-red-50 dark:bg-gray-900 dark:border-red-800 dark:hover:bg-red-900/20"
                  : item.action === "add"
                  ? "border-[#1515F5]/20 text-[#1515F5] bg-white hover:bg-[#F0F0FF] dark:bg-gray-900 dark:border-[#1515F5]/40 dark:hover:bg-gray-800"
                  : "border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800"
              }`}
              style={{ animationDelay: `${i * 100}ms` }}
            >
              {item.label[lang as keyof typeof item.label] || item.label.en}
            </button>
          ))}
        </div>
      )}

      {adminPhase === "choose-category" && onAdminInput && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          {adminCategories.map((cat, i) => (
            <button
              key={cat}
              onClick={() => onAdminInput(cat)}
              className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors cursor-pointer dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 animate-pop-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {adminPhase === "choose-audience" && onAdminInput && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          {adminAudiences.map((aud, i) => (
            <button
              key={aud}
              onClick={() => onAdminInput(aud)}
              className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors cursor-pointer dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 animate-pop-in"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {aud}
            </button>
          ))}
        </div>
      )}

      {adminPhase === "choose-link" && onAdminInput && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          <button
            onClick={() => onAdminInput("ja")}
            className="text-sm px-4 py-2 rounded-full border border-[#1515F5]/20 text-[#1515F5] bg-white hover:bg-[#F0F0FF] transition-colors cursor-pointer dark:bg-gray-900 dark:border-[#1515F5]/40 dark:hover:bg-gray-800 animate-pop-in"
          >
            {lang === "nl" ? "Ja" : lang === "de" ? "Ja" : "Yes"}
          </button>
          <button
            onClick={() => onAdminInput("nee")}
            className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] transition-colors cursor-pointer dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 animate-pop-in"
            style={{ animationDelay: "100ms" }}
          >
            {lang === "nl" ? "Nee" : lang === "de" ? "Nein" : "No"}
          </button>
        </div>
      )}

      {(adminPhase === "preview" || adminPhase === "applying") && onAdminApply && onAdminCancel && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          <button
            onClick={onAdminApply}
            disabled={adminPhase === "applying"}
            className="text-sm px-4 py-2 rounded-full border border-[#1515F5]/20 text-white bg-[#1515F5] hover:bg-[#1010D0] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed animate-pop-in"
          >
            {adminPhase === "applying"
              ? (lang === "nl" ? "Bezig..." : lang === "de" ? "Läuft..." : "Applying...")
              : (lang === "nl" ? "NU DOORVOEREN" : lang === "de" ? "JETZT ANWENDEN" : "APPLY NOW")}
          </button>
          {onAdminRevise && adminPhase === "preview" && (
            <button
              onClick={onAdminRevise}
              className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors cursor-pointer dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 animate-pop-in"
              style={{ animationDelay: "100ms" }}
            >
              {lang === "nl" ? "Aanpassen" : lang === "de" ? "Ändern" : "Revise"}
            </button>
          )}
          <button
            onClick={onAdminCancel}
            disabled={adminPhase === "applying"}
            className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] transition-colors cursor-pointer disabled:opacity-50 dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 animate-pop-in"
            style={{ animationDelay: "200ms" }}
          >
            {lang === "nl" ? "Annuleren" : lang === "de" ? "Abbrechen" : "Cancel"}
          </button>
        </div>
      )}

      {adminPhase === "revise" && onAdminInput && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          {([
            { value: "vraag", label: { en: "Question", nl: "Vraag", de: "Frage" } },
            { value: "antwoord", label: { en: "Answer", nl: "Antwoord", de: "Antwort" } },
            { value: "categorie", label: { en: "Category", nl: "Categorie", de: "Kategorie" } },
            { value: "doelgroep", label: { en: "Audience", nl: "Doelgroep", de: "Zielgruppe" } },
            { value: "link", label: { en: "Link", nl: "Link", de: "Link" } },
            { value: "alles", label: { en: "All", nl: "Alles", de: "Alles" } },
          ]).map((item, i) => (
            <button
              key={item.value}
              onClick={() => onAdminInput(item.value)}
              className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors cursor-pointer dark:bg-gray-900 dark:border-gray-700 dark:hover:bg-gray-800 animate-pop-in"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              {item.label[lang as keyof typeof item.label] || item.label.en}
            </button>
          ))}
        </div>
      )}

      {!adminPhase || adminPhase === "idle" ? (
        <>
          {flowPhase === "active" && currentFlowStep && !isLoading && (
            <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
              <FlowOptions
                options={currentFlowStep.nextDialogFlow || []}
                onSelect={handleFlowOption}
                getFlowLabel={getFlowLabel}
                kiosk={kiosk}
              />
            </div>
          )}

          {feedbackFollowUpLogId && !isLoading && (
            <FeedbackFollowUp
              onYes={() => {
                const logId = feedbackFollowUpLogId;
                setFeedbackFollowUpLogId(null);
                if (shopifyUser) {
                  const confirmMsg: Message = { role: "assistant", content: t("feedback.followUpConfirm") };
                  setMessages((prev) => [...prev, confirmMsg]);
                  fetch(`/api/chat/log/${encodeURIComponent(logId)}/feedback`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contact: shopifyUser.email }),
                  }).catch(() => {});
                } else {
                  const askMsg: Message = { role: "assistant", content: t("feedback.askContact") };
                  setMessages((prev) => [...prev, askMsg]);
                  setFeedbackContactLogId(logId);
                }
              }}
              onNo={() => {
                setFeedbackFollowUpLogId(null);
                const declineMsg: Message = { role: "assistant", content: t("feedback.followUpDecline") };
                setMessages((prev) => [...prev, declineMsg]);
              }}
              t={t}
            />
          )}

          {followUpSuggestions.length > 0 && !isLoading && (
            <FollowUpSuggestions
              suggestions={followUpSuggestions}
              onSelect={onFollowUpSelect}
            />
          )}
        </>
      ) : null}

      {isLoading && <TypingIndicator />}

      <div ref={messagesEndRef} />
    </div>
  );
}
