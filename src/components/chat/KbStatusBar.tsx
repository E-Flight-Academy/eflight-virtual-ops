"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { KbStatus } from "@/types/chat";
import type { UiLabels } from "@/lib/i18n/labels";

interface KbStatusBarProps {
  kbStatus: KbStatus | null;
  kbExpanded: boolean;
  onToggle: () => void;
  t: (key: keyof UiLabels) => string;
  currentClient: string | null;
  onRefreshStatus?: () => void;
}

export default function KbStatusBar({ kbStatus, kbExpanded, onToggle, t, currentClient, onRefreshStatus }: KbStatusBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { startX, startY, origX, origY } = dragRef.current;
    setPos({ x: origX + (e.clientX - startX), y: origY + (e.clientY - startY) });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const navigate = useCallback((params: Record<string, string | null>) => {
    const url = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value) {
        url.set(key, value);
      } else {
        url.delete(key);
      }
    }
    url.set("debug", "true");
    router.push(`?${url.toString()}`);
    // Refresh KB status after URL update
    setTimeout(() => onRefreshStatus?.(), 100);
  }, [searchParams, router, onRefreshStatus]);

  const currentRole = searchParams.get("role");
  const currentUserEmail = searchParams.get("user");

  const [emailInput, setEmailInput] = useState(currentUserEmail || "");

  const modes = [
    { key: null, label: "Standard" },
    { key: "kiosk", label: "Kiosk" },
    { key: "briefing", label: "Briefing" },
  ] as const;

  const roles = [
    { key: null, label: "Anonymous" },
    { key: "student", label: "Student" },
    { key: "renter", label: "Renter" },
    { key: "instructor", label: "Instructor" },
    { key: "operations", label: "Operations" },
  ] as const;

  const style: React.CSSProperties = pos
    ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }
    : { position: "fixed", bottom: 16, right: 16, zIndex: 50 };

  return (
    <div ref={panelRef} style={style} className="w-80 bg-white/95 backdrop-blur shadow-lg rounded-xl border border-[#ECECEC] text-xs select-none">
      {/* Drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-grab active:cursor-grabbing border-b border-[#ECECEC]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="text-e-grey">⠿</span>
        <span className="font-semibold text-e-grey-dark flex-1">Debug</span>
        <button onClick={onToggle} className="cursor-pointer p-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-e-grey transition-transform ${kbExpanded ? "rotate-180" : ""}`}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {kbExpanded && (
        <div className="px-3 py-2 space-y-2">
          {/* Client mode selector */}
          <div>
            <div className="text-[10px] text-e-grey font-medium uppercase tracking-wide mb-1">Client</div>
            <div className="flex bg-[#F2F2F2] rounded-lg p-0.5">
              {modes.map(({ key, label }) => {
                const active = currentClient === key;
                return (
                  <button
                    key={label}
                    onClick={() => navigate({ client: key })}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                      active
                        ? "bg-white text-e-indigo-dark shadow-sm"
                        : "text-e-grey hover:text-e-grey-dark"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Role override selector */}
          <div>
            <div className="text-[10px] text-e-grey font-medium uppercase tracking-wide mb-1">Role</div>
            <div className="flex bg-[#F2F2F2] rounded-lg p-0.5 flex-wrap">
              {roles.map(({ key, label }) => {
                const active = currentRole === key;
                return (
                  <button
                    key={label}
                    onClick={() => navigate({ role: key })}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? "bg-white text-e-indigo-dark shadow-sm"
                        : "text-e-grey hover:text-e-grey-dark"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* User email override (dev only) */}
          <div className="flex gap-1 items-center">
            <input
              type="text"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailInput.trim()) {
                  navigate({ user: emailInput.trim(), role: null });
                }
              }}
              placeholder="user@email.com"
              className="flex-1 px-2 py-1 rounded-md text-[11px] border border-[#ECECEC] bg-white outline-none focus:border-e-indigo"
            />
            <button
              onClick={() => {
                if (emailInput.trim()) {
                  navigate({ user: emailInput.trim(), role: null });
                } else {
                  navigate({ user: null });
                }
              }}
              className="px-2 py-1 rounded-md text-[11px] font-medium bg-e-indigo-dark text-white cursor-pointer hover:bg-e-indigo"
            >
              {emailInput.trim() ? "Go" : "Clear"}
            </button>
          </div>

          {/* Reset override */}
          {(currentRole || (currentUserEmail && currentUserEmail !== "true")) && (
            <button
              onClick={() => navigate({ user: null, role: null })}
              className="w-full px-2 py-1 rounded-md text-[11px] font-medium bg-e-pink text-white cursor-pointer hover:bg-e-pink/80 transition-colors"
            >
              ✕ Stop impersonating
            </button>
          )}

          {/* KB status */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${
                kbStatus?.status === "synced"
                  ? "bg-emerald-500"
                  : kbStatus?.status === "loading"
                  ? "bg-amber-400 animate-pulse"
                  : "bg-e-grey-light"
              }`} />
              {kbStatus?.status === "synced" ? (
                <span className="text-e-grey">
                  {kbStatus.user?.override && <span className="text-e-pink font-medium">⚡ </span>}
                  {kbStatus.user?.email || "Not logged in"}
                </span>
              ) : kbStatus?.status === "loading" ? (
                <span className="text-e-grey">{t("kb.label")} &middot; {t("kb.loading")}</span>
              ) : (
                <span className="text-e-grey">{t("kb.label")} &middot; {t("kb.notSynced")}</span>
              )}
            </div>
            {kbStatus?.status === "synced" && (
              <>
                {kbStatus.user?.roles && kbStatus.user.roles.length > 0 && (
                  <div className="text-e-grey pl-3.5">Roles: {kbStatus.user.roles.join(", ")}</div>
                )}
                {kbStatus.user?.capabilities && kbStatus.user.capabilities.length > 0 && (
                  <div className="text-e-grey pl-3.5">Caps: {kbStatus.user.capabilities.join(", ")}</div>
                )}
                <div className="text-e-grey pl-3.5">Folders: {kbStatus.user?.folders?.join(", ") || "public"}</div>
                {kbStatus.searchOrder && (
                  <div className="text-e-grey pl-3.5">Search: {kbStatus.searchOrder.join(" → ")}</div>
                )}
              </>
            )}
          </div>

          {/* Counts */}
          {kbStatus?.status === "synced" && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-e-grey">
              <span>{kbStatus.filteredFileCount ?? kbStatus.fileCount} docs</span>
              <span>&middot; {kbStatus.faqCount ?? "?"} FAQs</span>
              <span>&middot; {kbStatus.websitePageCount ?? "?"} pages</span>
            </div>
          )}

          {/* File list */}
          {kbStatus?.status === "synced" && (
            <div className="max-h-32 overflow-y-auto">
              <ul className="text-e-grey space-y-0.5">
                {(kbStatus.filteredFileNames ?? kbStatus.fileNames).map((name, i) => (
                  <li key={i} className="flex items-center gap-1.5 truncate">
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    {name}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {kbStatus?.status === "loading" && (
            <p className="text-e-grey">{t("kb.loadingDetail")}</p>
          )}

          {kbStatus?.status === "not_synced" && (
            <p className="text-e-grey">{t("kb.notSyncedDetail")}</p>
          )}
        </div>
      )}

      {/* Version */}
      <button
        className="w-full px-3 py-1.5 text-[10px] text-e-grey-light text-center cursor-pointer hover:text-e-grey transition-colors border-t border-[#ECECEC]"
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
