import { useState, useEffect, useCallback } from "react";
import type { Message, FlowOption, FlowStep, FlowPhase } from "@/types/chat";

interface UseFlowParams {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  lang: string;
  userRoles: string[];
  getFlowMessage: (step: FlowStep) => string;
  getFlowLabel: (option: FlowOption) => string;
  getFlowEndPrompt: (step: FlowStep) => string | undefined;
  getFlowFaqQuestion: (step: FlowStep) => string | undefined;
  getFlowFaqAnswer: (step: FlowStep) => string | undefined;
  showWithThinkingDelay: (baseMessages: Message[], answer: string, onComplete?: () => void) => Promise<void>;
  sendMessage: (text: string, baseMessages?: Message[], hidden?: boolean) => Promise<void>;
  switchLanguage: (lang: string) => Promise<void>;
  sharedChatIdRef: React.MutableRefObject<string | null>;
  onCapabilityAction?: (action: string) => void;
  onLogin?: () => void;
}

/** Find the best welcome step for the user's roles. Tries welcome_{role} first, falls back to welcome. */
export function findWelcomeStep(flowSteps: FlowStep[], userRoles: string[]): FlowStep | undefined {
  for (const role of userRoles) {
    const roleWelcome = flowSteps.find((s) => s.name.toLowerCase() === `welcome_${role.toLowerCase()}`);
    if (roleWelcome) return roleWelcome;
  }
  return flowSteps.find((s) => s.name.toLowerCase() === "welcome");
}

/** Build a merged welcome step combining options from all matching role-specific welcome steps.
 *  For multi-role users (e.g. Student + Instructor), this merges the nextDialogFlow options
 *  from all matching welcome_{role} steps, deduplicating by option name. */
export function buildMergedWelcomeStep(flowSteps: FlowStep[], userRoles: string[]): FlowStep | undefined {
  const genericWelcome = flowSteps.find((s) => s.name.toLowerCase() === "welcome");

  // Find all matching role-specific welcome steps
  const matchingSteps: FlowStep[] = [];
  for (const role of userRoles) {
    const roleWelcome = flowSteps.find((s) => s.name.toLowerCase() === `welcome_${role.toLowerCase()}`);
    if (roleWelcome && !matchingSteps.includes(roleWelcome)) matchingSteps.push(roleWelcome);
  }

  if (matchingSteps.length === 0) return genericWelcome;
  if (matchingSteps.length === 1) return matchingSteps[0];

  // Merge: collect unique options from all matching steps, then sort by order
  // Deduplicate by both name AND label (e.g. instr_other and st_other share the same label)
  const seenNames = new Set<string>();
  const seenLabels = new Set<string>();
  const allOptions: FlowOption[] = [];

  for (const step of matchingSteps) {
    for (const option of step.nextDialogFlow) {
      if (!seenNames.has(option.name) && !seenLabels.has(option.label)) {
        allOptions.push(option);
        seenNames.add(option.name);
        seenLabels.add(option.label);
      }
    }
  }

  // Sort by the order field of the corresponding flow step
  const stepOrderMap = new Map(flowSteps.map((s) => [s.name, s.order]));
  allOptions.sort((a, b) => (stepOrderMap.get(a.name) ?? 999) - (stepOrderMap.get(b.name) ?? 999));

  const merged: FlowStep = { ...matchingSteps[0], nextDialogFlow: allOptions };
  return merged;
}

export function useFlow({
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
  sendMessage,
  switchLanguage,
  sharedChatIdRef,
  onCapabilityAction,
  onLogin,
}: UseFlowParams) {
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([]);
  const [flowPhase, setFlowPhase] = useState<FlowPhase>("loading");
  const [flowContext, setFlowContext] = useState<Record<string, string>>({});
  const [currentFlowStep, setCurrentFlowStep] = useState<FlowStep | null>(null);
  const [pendingFlowStepName, setPendingFlowStepName] = useState<string | null>(null);

  // Load shared chat from URL parameter
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

  // Switch to role-specific welcome when user roles change (login, debug panel role switch)
  useEffect(() => {
    if (flowSteps.length === 0) return;
    if (flowPhase !== "active" || !currentFlowStep) return;
    // Only switch if still on a welcome step and no user messages yet
    if (!currentFlowStep.name.toLowerCase().startsWith("welcome")) return;
    if (messages.length !== 1 || messages[0].role !== "assistant") return;

    const mergedWelcome = buildMergedWelcomeStep(flowSteps, userRoles);
    if (!mergedWelcome) return;

    // Check if options actually changed to avoid unnecessary re-renders
    const currentNames = currentFlowStep.nextDialogFlow.map((o) => o.name).join(",");
    const newNames = mergedWelcome.nextDialogFlow.map((o) => o.name).join(",");
    if (currentNames === newNames && currentFlowStep.name === mergedWelcome.name) return;

    setCurrentFlowStep(mergedWelcome);
    setMessages([{ role: "assistant", content: getFlowMessage(mergedWelcome) }]);
  }, [userRoles, flowSteps, flowPhase, currentFlowStep, messages, setMessages, getFlowMessage]);

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
  }, [lang, flowPhase, currentFlowStep, getFlowMessage, messages, setMessages]);

  const handleFlowOption = useCallback((stepName: string, displayLabel: string) => {
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
    if (currentFlowStep.endAction === "Login") {
      onLogin?.();
      return;
    }

    if (currentFlowStep.endAction === "Capability Action") {
      setMessages([...messages, userMsg]);
      if (onCapabilityAction && currentFlowStep.contextKey) {
        onCapabilityAction(currentFlowStep.contextKey);
      }
      return;
    }

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
        const cardLabel = currentFlowStep.relatedFaqLinkLabel || faqTitle;
        const answerWithSource = faqUrl
          ? `${faqAnswer}\n\n[link: ${faqUrl} | ${cardLabel}]\n[source: FAQ | ${faqUrl} | ${faqTitle}]`
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

    // If the next step triggers login
    if (nextStep.endAction === "Login") {
      onLogin?.();
      return;
    }

    // If the next step triggers a capability action
    if (nextStep.endAction === "Capability Action") {
      setMessages([...messages, userMsg]);
      if (onCapabilityAction && nextStep.contextKey) {
        onCapabilityAction(nextStep.contextKey);
      }
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
        const cardLabel = nextStep.relatedFaqLinkLabel || faqTitle;
        const answerWithSource = faqUrl
          ? `${faqAnswer}\n\n[link: ${faqUrl} | ${cardLabel}]\n[source: FAQ | ${faqUrl} | ${faqTitle}]`
          : `${faqAnswer}\n\n[source: FAQ | ${faqTitle}]`;
        const baseMessages = nextMsg
          ? [...messages, userMsg, { role: "assistant" as const, content: nextMsg }, faqUserMsg]
          : [...messages, faqUserMsg];
        setMessages(baseMessages);
        showWithThinkingDelay(baseMessages, answerWithSource);
        return;
      }
      // Otherwise use endPrompt with Gemini, or show the pre-translated message directly
      const prompt = getFlowEndPrompt(nextStep);
      if (prompt) {
        const updatedMessages = nextMsg
          ? [...messages, userMsg, { role: "assistant" as const, content: nextMsg }]
          : [...messages, userMsg];
        setMessages(updatedMessages);
        sendMessage(prompt, updatedMessages, true);
      } else if (nextMsg) {
        const updatedMessages = [...messages, userMsg];
        setMessages(updatedMessages);
        showWithThinkingDelay(updatedMessages, nextMsg);
      } else {
        setMessages([...messages, userMsg]);
      }
      return;
    }

    setCurrentFlowStep(nextStep);
    const baseMessages = [...messages, userMsg];
    setMessages(baseMessages);
    showWithThinkingDelay(baseMessages, getFlowMessage(nextStep));
  }, [currentFlowStep, flowContext, flowSteps, messages, setMessages, getFlowMessage, getFlowLabel, getFlowEndPrompt, getFlowFaqQuestion, getFlowFaqAnswer, showWithThinkingDelay, sendMessage, onCapabilityAction, onLogin]);

  const handleNewChat = useCallback((inputRef: React.RefObject<HTMLTextAreaElement | null>, setInput: (v: string) => void) => {
    if (messages.length === 0) return;
    setInput("");
    setFlowContext({});
    const welcome = buildMergedWelcomeStep(flowSteps, userRoles);
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
  }, [messages.length, flowSteps, userRoles, setMessages, getFlowMessage]);

  return {
    flowSteps,
    setFlowSteps,
    flowPhase,
    setFlowPhase,
    currentFlowStep,
    setCurrentFlowStep,
    flowContext,
    setFlowContext,
    pendingFlowStepName,
    setPendingFlowStepName,
    handleFlowOption,
    handleNewChat,
  };
}
