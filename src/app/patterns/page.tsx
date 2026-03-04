export default function PatternsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFEFEF] to-[#F7F7F7] p-8 fixed inset-0 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-12">
        <div>
          <h1 className="text-3xl font-bold text-e-indigo-dark mb-2">Steward Pattern Library</h1>
          <p className="text-e-grey">All button types, states, and interactive elements used in Steward.</p>
        </div>

        {/* ===== FLOW OPTIONS ===== */}
        <Section title="Flow Option" description="Primary action pill. Grey bg, semibold, fills indigo on hover. With or without icon.">
          <div className="flex flex-wrap gap-2">
            <button className="font-semibold rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer text-base px-4 py-2">
              <span>🎓</span> Student
            </button>
            <button className="font-semibold rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer text-base px-4 py-2">
              <span>📋</span> Document validiteit
            </button>
            <button className="font-semibold rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer text-base px-4 py-2">
              Without icon
            </button>
          </div>
          <Label>Kiosk variant (larger)</Label>
          <div className="flex flex-wrap gap-2">
            <button className="font-semibold rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer text-lg px-5 py-3">
              <span>🎓</span> Student (kiosk)
            </button>
          </div>
          <UsedIn items={[
            "Guided intake flow options (Student, Instructeur, etc.)",
            "Capability actions (Document validiteit — filtered by capability)",
            "Feedback response (Ja / Nee)",
          ]} />
          <CodeRef>FlowOptions.tsx, FeedbackFollowUp.tsx</CodeRef>
        </Section>

        {/* ===== SUGGESTION PILLS ===== */}
        <Section title="Suggestion Pill" description="Light pill with grey text. Indigo text on hover. Used for all suggested questions.">
          <div className="flex flex-wrap gap-2">
            <button className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors cursor-pointer">
              Wat kost een vliegopleiding?
            </button>
            <button className="text-sm px-4 py-2 rounded-full border border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5] transition-colors cursor-pointer">
              More FAQ&apos;s
            </button>
          </div>
          <UsedIn items={[
            "Starter questions on welcome screen",
            "Follow-up suggestions after AI response (+ animate-pop-in)",
          ]} />
          <CodeRef>WelcomeScreen.tsx (starters), FollowUpSuggestions.tsx</CodeRef>
        </Section>

        {/* ===== PRIMARY FILLED ===== */}
        <Section title="Primary Filled" description="Solid indigo background with white text. Main CTA style.">
          <div className="flex flex-wrap gap-2 items-center">
            <button className="text-sm px-4 py-2 rounded-full border border-[#1515F5]/20 text-white bg-[#1515F5] hover:bg-[#1010D0] transition-colors cursor-pointer">
              Toepassen
            </button>
            <button className="text-sm px-4 py-2 rounded-full border border-[#1515F5]/20 text-white bg-[#1515F5] hover:bg-[#1010D0] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" disabled>
              Disabled
            </button>
            <button className="px-6 py-2.5 rounded-full bg-[#1515F5] text-white font-medium hover:bg-[#1212D0] transition-colors cursor-pointer">
              Ask Steward!
            </button>
          </div>
          <UsedIn items={[
            "Admin apply/confirm button",
            "FAQ modal CTA (Ask Steward!)",
            "Multi-select confirm button",
          ]} />
          <CodeRef>MessageList.tsx (admin apply), FaqModal.tsx</CodeRef>
        </Section>

        {/* ===== TOGGLE PILLS ===== */}
        <Section title="Toggle Pill" description="Toggleable pill with selected (indigo filled) and unselected (grey outline) states.">
          <div className="flex flex-wrap gap-2">
            <button className="text-sm px-4 py-2 rounded-full border transition-colors cursor-pointer border-[#1515F5] bg-[#1515F5] text-white">
              Selected
            </button>
            <button className="text-sm px-4 py-2 rounded-full border transition-colors cursor-pointer border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5]">
              Unselected
            </button>
            <button className="text-sm px-4 py-2 rounded-full border transition-colors cursor-pointer border-[#ECECEC] text-[#828282] bg-white hover:bg-[#F7F7F7] hover:text-[#1515F5]">
              Unselected
            </button>
          </div>
          <UsedIn items={[
            "Multi-select pill options in flow",
            "Admin field choice buttons",
          ]} />
          <CodeRef>MultiSelectPills.tsx</CodeRef>
        </Section>

        {/* ===== DANGER PILL ===== */}
        <Section title="Danger Pill" description="Red-tinted pill for destructive actions.">
          <div className="flex flex-wrap gap-2">
            <button className="text-sm px-4 py-2 rounded-full border transition-colors cursor-pointer border-red-200 text-red-600 bg-white hover:bg-red-50">
              Verwijderen
            </button>
          </div>
          <UsedIn items={["Admin delete action"]} />
          <CodeRef>MessageList.tsx (admin delete)</CodeRef>
        </Section>

        {/* ===== HEADER ICON BUTTONS ===== */}
        <Section title="Header Icon Button" description="Icon button for the top header bar. Grey icon, indigo on hover.">
          <div className="flex flex-wrap gap-2 items-center">
            <button className="flex items-center gap-2 p-2 rounded-xl text-e-grey hover:text-e-indigo hover:bg-[#F0F0FF] transition-colors cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button className="flex items-center gap-2 p-2 rounded-xl text-e-grey hover:text-e-indigo hover:bg-[#F0F0FF] transition-colors cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
            <button className="flex items-center gap-2 p-2 rounded-xl text-e-grey hover:text-e-indigo hover:bg-[#F0F0FF] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent" disabled>
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </button>
          </div>
          <Label>Default, hover, disabled</Label>
          <UsedIn items={[
            "New chat, share, FAQ, login, logout, user menu, admin edit",
          ]} />
          <CodeRef>ChatHeader.tsx</CodeRef>
        </Section>

        {/* ===== LANGUAGE SELECTOR ===== */}
        <Section title="Language Selector" description="Dropdown toggle + options with active/inactive state.">
          <div className="flex flex-wrap gap-2 items-center">
            <button className="flex items-center gap-2 px-3 py-2 rounded-md bg-[#F7F7F7] text-[#828282] text-sm font-medium hover:bg-[#ECECEC] transition-colors cursor-pointer">
              EN ▾
            </button>
          </div>
          <Label>Dropdown options (active / inactive)</Label>
          <div className="inline-flex flex-col bg-white rounded-lg shadow-lg border border-[#ECECEC] overflow-hidden">
            <button className="w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer bg-[#1515F5] text-white">
              English
            </button>
            <button className="w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer text-[#828282] hover:bg-[#F7F7F7]">
              Nederlands
            </button>
            <button className="w-full px-4 py-2 text-left text-sm transition-colors cursor-pointer text-[#828282] hover:bg-[#F7F7F7]">
              Deutsch
            </button>
          </div>
          <CodeRef>ChatHeader.tsx</CodeRef>
        </Section>

        {/* ===== INPUT BUTTONS ===== */}
        <Section title="Input Action Buttons" description="Circular buttons in the chat input area.">
          <div className="flex gap-3 items-center">
            <button className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-e-indigo-light text-white hover:bg-e-indigo cursor-pointer transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
            <button className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full bg-e-indigo-light text-white hover:bg-e-indigo cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed" disabled>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
            <button className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full cursor-pointer transition-colors bg-e-mint-light text-e-grey hover:text-e-indigo hover:bg-e-mint">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
            <button className="w-12 h-12 shrink-0 flex items-center justify-center rounded-full cursor-pointer transition-colors bg-red-500 text-white animate-mic-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
          </div>
          <Label>Send, Send (disabled), Mic (idle), Mic (listening)</Label>
          <CodeRef>ChatInput.tsx</CodeRef>
        </Section>

        {/* ===== RATING BUTTONS ===== */}
        <Section title="Rating Buttons" description="Thumbs up/down for message feedback. Inactive (grey) and active (indigo filled).">
          <div className="flex gap-1 items-center">
            <button className="p-1 rounded transition-colors cursor-pointer text-[#ABABAB] hover:text-[#828282]">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
            </button>
            <button className="p-1 rounded transition-colors cursor-pointer bg-[#1515F5] text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12" /><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z" /></svg>
            </button>
            <span className="text-xs text-e-grey ml-2">Inactive / Active</span>
          </div>
          <CodeRef>MessageBubble.tsx</CodeRef>
        </Section>

        {/* ===== LINK CARDS ===== */}
        <Section title="Link Cards" description="Clickable card buttons linking to relevant pages, shown below AI responses.">
          <div className="space-y-2 max-w-md">
            <a href="#" className="flex items-center gap-2.5 px-3 py-2 bg-[#F7F7F7] rounded-lg hover:bg-[#ECECEC] transition-colors cursor-pointer no-underline">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1515F5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              <span className="text-sm text-[#1515F5] font-medium">Vliegopleiding PPL(A)</span>
            </a>
            <a href="#" className="flex items-center gap-3 w-full px-3 py-2.5 bg-[#F7F7F7] rounded-xl hover:bg-[#ECECEC] transition-colors cursor-pointer no-underline">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#828282" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></svg>
              <div>
                <div className="text-xs text-[#828282]">Source</div>
                <div className="text-sm text-foreground font-medium">E-Flight Academy Website</div>
              </div>
            </a>
          </div>
          <UsedIn items={[
            "Inline link cards below AI response",
            "Source attribution card",
          ]} />
          <CodeRef>MessageBubble.tsx</CodeRef>
        </Section>

        {/* ===== TAP & TALK ===== */}
        <Section title="Tap &amp; Talk (Kiosk)" description="Large mic buttons for kiosk mode, one per language. Idle (mint) and listening (red pulsing).">
          <div className="flex gap-3 max-w-xl">
            <button className="flex-1 flex items-center justify-start gap-3 px-5 py-4 rounded-2xl text-base font-medium cursor-pointer transition-all bg-e-mint-light text-foreground hover:bg-e-mint">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              Speak English
            </button>
            <button className="flex-1 flex items-center justify-start gap-3 px-5 py-4 rounded-2xl text-base font-medium cursor-pointer transition-all bg-red-500 text-white animate-mic-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="22" />
              </svg>
              Listening...
            </button>
          </div>
          <CodeRef>WelcomeScreen.tsx</CodeRef>
        </Section>

      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-foreground">{title}</h2>
        <p className="text-sm text-e-grey">{description}</p>
      </div>
      <div className="bg-white rounded-xl border border-[#ECECEC] p-6 space-y-4">
        {children}
      </div>
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-e-grey font-medium uppercase tracking-wide pt-2">{children}</p>;
}

function UsedIn({ items }: { items: string[] }) {
  return (
    <div className="pt-2">
      <p className="text-xs text-e-grey font-medium uppercase tracking-wide mb-1">Used in</p>
      <ul className="text-xs text-e-grey space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-e-grey-light shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CodeRef({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-e-grey-light font-mono pt-1">{children}</p>;
}
