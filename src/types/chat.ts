export interface Message {
  role: "user" | "assistant";
  content: string;
  logId?: string;
  rating?: "👍" | "👎";
}

export interface FlowOption {
  name: string;
  label: string;
  labelNl: string;
  labelDe: string;
  icon: string | null;
  capability: string | null;
}

export interface FlowStep {
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

export type FlowPhase = "loading" | "active" | "completed" | "skipped";

export interface KbStatus {
  status: "synced" | "not_synced" | "loading";
  fileCount: number;
  fileNames: string[];
  lastSynced: string | null;
  faqCount?: number;
  websitePageCount?: number;
  searchOrder?: string[];
  user?: {
    email: string | null;
    roles: string[];
    folders: string[];
    capabilities?: string[];
    override?: boolean;
  };
  filteredFileCount?: number;
  filteredFileNames?: string[];
}
