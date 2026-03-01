import type { KbStatus } from "@/types/chat";
import type { UiLabels } from "@/lib/i18n/labels";

interface KbStatusBarProps {
  kbStatus: KbStatus | null;
  kbExpanded: boolean;
  onToggle: () => void;
  t: (key: keyof UiLabels) => string;
}

export default function KbStatusBar({ kbStatus, kbExpanded, onToggle, t }: KbStatusBarProps) {
  return (
    <div className="border-t border-e-pale dark:border-gray-800">
      <button
        onClick={onToggle}
        aria-expanded={kbExpanded}
        aria-label="Knowledge base status"
        className="w-full px-4 py-2 flex items-center justify-center gap-2 text-xs text-e-grey hover:bg-e-pale-light dark:hover:bg-gray-900 transition-colors cursor-pointer"
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
            {kbStatus.user?.email ? kbStatus.user.email : "Not logged in"}
            {kbStatus.user?.roles && kbStatus.user.roles.length > 0 && <> &middot; {kbStatus.user.roles.join(", ")}</>}
            {" "}&middot; Folders: {kbStatus.user?.folders?.join(", ") || "public"}
            {" "}&middot; {kbStatus.filteredFileCount ?? kbStatus.fileCount} docs
            {kbStatus.faqCount != null && <> &middot; {kbStatus.faqCount} FAQs</>}
            {kbStatus.websitePageCount != null && <> &middot; {kbStatus.websitePageCount} pages</>}
          </span>
        ) : kbStatus?.status === "loading" ? (
          <span>{t("kb.label")} &middot; {t("kb.loading")}</span>
        ) : (
          <span>{t("kb.label")} &middot; {t("kb.notSynced")}</span>
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
            {(kbStatus.filteredFileNames ?? kbStatus.fileNames).map((name, i) => (
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
            {t("kb.loadingDetail")}
          </p>
        </div>
      )}

      {kbExpanded && kbStatus?.status === "not_synced" && (
        <div className="px-4 pb-3">
          <p className="text-xs text-e-grey">
            {t("kb.notSyncedDetail")}
          </p>
        </div>
      )}

      <button
        className="w-full px-4 pb-1 text-[10px] text-e-grey-light text-center cursor-pointer hover:text-e-grey transition-colors"
        onClick={() => {
          const version = `v${process.env.NEXT_PUBLIC_VERSION} (${process.env.NEXT_PUBLIC_BUILD_ID})`;
          navigator.clipboard.writeText(version);
          const el = document.getElementById("version-label");
          if (el) {
            const original = el.textContent;
            el.textContent = "Copied!";
            setTimeout(() => { el.textContent = original; }, 1500);
          }
        }}
      >
        <span id="version-label">v{process.env.NEXT_PUBLIC_VERSION} ({process.env.NEXT_PUBLIC_BUILD_ID})</span>
      </button>
    </div>
  );
}
