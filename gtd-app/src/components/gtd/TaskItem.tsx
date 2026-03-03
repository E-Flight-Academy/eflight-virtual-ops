"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  text: string;
  done: boolean;
  onToggle: () => void;
  onUpdate: (text: string) => void;
  onDelete: () => void;
}

export default function TaskItem({ text, done, onToggle, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== text) onUpdate(trimmed);
    else setDraft(text);
    setEditing(false);
  }

  return (
    <li className="group flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-surface-hover transition-colors">
      {/* Checkbox */}
      <button
        onClick={onToggle}
        className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
          done
            ? "bg-accent border-accent text-white"
            : "border-muted-light hover:border-accent"
        }`}
        aria-label={done ? "Mark incomplete" : "Mark complete"}
      >
        {done && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Text / edit */}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setDraft(text); setEditing(false); }
          }}
          className="flex-1 bg-transparent border-b-2 border-accent outline-none py-0.5"
        />
      ) : (
        <span
          onDoubleClick={() => setEditing(true)}
          className={`flex-1 cursor-default select-none transition-colors ${
            done ? "line-through text-muted" : ""
          }`}
        >
          {text}
        </span>
      )}

      {/* Delete */}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 text-muted hover:text-danger transition-all p-1 cursor-pointer"
        aria-label="Delete task"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}
