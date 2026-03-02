"use client";

import React from "react";
import type { Message, FlowOption, FlowStep } from "@/types/chat";
import type { UiLabels } from "@/lib/i18n/labels";
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
}: MessageListProps) {
  return (
    <div role="log" aria-live="polite" aria-label="Chat messages" className="space-y-6">
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

      {flowPhase === "active" && currentFlowStep && !isLoading && (
        <div className="max-w-4xl mx-auto w-full pl-11 flex flex-wrap gap-2">
          <FlowOptions
            options={currentFlowStep.nextDialogFlow || []}
            onSelect={handleFlowOption}
            getFlowLabel={getFlowLabel}
          />
        </div>
      )}

      {feedbackFollowUpLogId && !isLoading && (
        <FeedbackFollowUp
          onYes={() => {
            const logId = feedbackFollowUpLogId;
            setFeedbackFollowUpLogId(null);
            if (shopifyUser) {
              // Logged in: save email directly
              const confirmMsg: Message = { role: "assistant", content: t("feedback.followUpConfirm") };
              setMessages((prev) => [...prev, confirmMsg]);
              fetch(`/api/chat/log/${encodeURIComponent(logId)}/feedback`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contact: shopifyUser.email }),
              }).catch(() => {});
            } else {
              // Not logged in: ask for contact info
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

      {isLoading && <TypingIndicator />}

      <div ref={messagesEndRef} />
    </div>
  );
}
