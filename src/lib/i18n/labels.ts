export interface UiLabels {
  "login.subtitle": string;
  "login.placeholder": string;
  "login.button": string;
  "login.error.incorrect": string;
  "login.error.connection": string;
  "header.subtitle": string;
  "header.newChat": string;
  "header.logout": string;
  "reset.confirm": string;
  "reset.cancel": string;
  "reset.confirmButton": string;
  "chat.welcome": string;
  "chat.welcomeSub": string;
  "chat.placeholder": string;
  "chat.send": string;
  "chat.error": string;
  "chat.timeout": string;
  "kb.label": string;
  "kb.files": string;
  "kb.faqs": string;
  "kb.synced": string;
  "kb.loading": string;
  "kb.notSynced": string;
  "kb.loadingDetail": string;
  "kb.notSyncedDetail": string;
  "header.share": string;
}

export const DEFAULT_LABELS: UiLabels = {
  "login.subtitle": "Enter password to continue",
  "login.placeholder": "Password",
  "login.button": "Log in",
  "login.error.incorrect": "Incorrect password",
  "login.error.connection": "Failed to connect to the server.",
  "header.subtitle": "Your AI assistant for flight training questions",
  "header.newChat": "New conversation",
  "header.logout": "Log out",
  "reset.confirm": "Are you sure you want to start a new conversation?",
  "reset.cancel": "Cancel",
  "reset.confirmButton": "New conversation",
  "chat.welcome": "Welcome to Steward!",
  "chat.welcomeSub": "Ask me anything about flight training, scheduling, or academy operations.",
  "chat.placeholder": "Type your message...",
  "chat.send": "Send",
  "chat.error": "Failed to connect to the server.",
  "chat.timeout": "Sorry, the response took too long. Please try again or ask a simpler question.",
  "kb.label": "Knowledge base",
  "kb.files": "files",
  "kb.faqs": "FAQs",
  "kb.synced": "Synced",
  "kb.loading": "Loading documents...",
  "kb.notSynced": "Not synced yet",
  "kb.loadingDetail": "Loading documents from Google Drive. This may take a moment...",
  "kb.notSyncedDetail": "Documents will be loaded from Google Drive on the first chat message.",
  "header.share": "Share chat",
};
