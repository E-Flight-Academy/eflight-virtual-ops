import { useEffect } from "react";
import type { UiLabels } from "@/lib/i18n/labels";

interface ChatHeaderProps {
  client: string | null;
  lang: string;
  langOpen: boolean;
  setLangOpen: (v: boolean) => void;
  switchLanguage: (lang: string) => void;
  shopifyUser: { email: string; firstName: string; lastName: string; displayName: string } | null;
  userMenuOpen: boolean;
  setUserMenuOpen: (v: boolean) => void;
  displayRole: string;
  messagesLength: number;
  shareStatus: "idle" | "sharing" | "copied" | "error";
  onNewChat: () => void;
  onShare: () => void;
  onFaqOpen: () => void;
  onLogin: () => void;
  onLogout: () => void;
  t: (key: keyof UiLabels) => string;
}

export default function ChatHeader({
  client,
  lang,
  langOpen,
  setLangOpen,
  switchLanguage,
  shopifyUser,
  userMenuOpen,
  setUserMenuOpen,
  displayRole,
  messagesLength,
  shareStatus,
  onNewChat,
  onShare,
  onFaqOpen,
  onLogin,
  onLogout,
  t,
}: ChatHeaderProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (langOpen) setLangOpen(false);
        if (userMenuOpen) setUserMenuOpen(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [langOpen, userMenuOpen, setLangOpen, setUserMenuOpen]);

  return (
    <header className={`flex items-center ${client === "briefing" ? "justify-end" : "justify-between"} p-4 border-b border-e-pale dark:border-gray-800`}>
      {client !== "briefing" && <div>
        <h1 className="text-2xl font-extrabold text-e-indigo cursor-pointer" onClick={onNewChat}>Steward <span className="hidden min-[900px]:inline text-sm font-normal text-e-grey">E-Flight Academy Virtual Assistant</span></h1>
      </div>}
      <div className="flex items-center gap-4">
        <button
          onClick={onFaqOpen}
          title="FAQ"
          aria-label="Open FAQ"
          className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer"
        >
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <path d="M12 17h.01" />
          </svg>
          <span className="hidden sm:inline text-sm">FAQ</span>
        </button>
        <div className="relative">
          <button
            onClick={() => setLangOpen(!langOpen)}
            aria-expanded={langOpen}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#F7F7F7] text-[#828282] text-sm font-medium hover:bg-[#ECECEC] transition-colors dark:bg-gray-800 dark:hover:bg-gray-700 cursor-pointer"
          >
            {lang.toUpperCase()}
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          onClick={onNewChat}
          disabled={messagesLength === 0}
          title={t("header.newChat")}
          aria-label="New chat"
          className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <span className="hidden sm:inline text-sm">{t("header.newChat")}</span>
        </button>
        <button
          onClick={onShare}
          disabled={messagesLength === 0 || shareStatus === "sharing"}
          title={shareStatus === "copied" ? "Link copied!" : shareStatus === "error" ? "Failed to share" : t("header.share")}
          aria-label="Share chat"
          className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {shareStatus === "copied" ? (
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : shareStatus === "error" ? (
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
              aria-label="User menu"
              aria-expanded={userMenuOpen}
              className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer"
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span className="hidden sm:inline text-sm">{shopifyUser.firstName || shopifyUser.email}</span>
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="hidden sm:inline">
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
                      onClick={() => { setUserMenuOpen(false); onLogout(); }}
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
            onClick={onLogin}
            title={t("header.login")}
            aria-label="Login"
            className="flex items-center gap-2 text-e-grey hover:text-e-indigo transition-colors cursor-pointer"
          >
            <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            <span className="hidden sm:inline text-sm">{t("header.login")}</span>
          </button>
        )}
      </div>
    </header>
  );
}
