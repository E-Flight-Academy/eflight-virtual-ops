"use client";

import { useState } from "react";
import TaskItem from "./TaskItem";

interface Task {
  text: string;
  done: boolean;
}

interface GtdList {
  slug: string;
  title: string;
  created: string;
  tasks: Task[];
}

interface Props {
  list: GtdList;
  onUpdate: (list: GtdList) => void;
  onDelete: (slug: string) => void;
  onBack: () => void;
}

export default function TaskList({ list, onUpdate, onDelete, onBack }: Props) {
  const [newTask, setNewTask] = useState("");

  const total = list.tasks.length;
  const completed = list.tasks.filter((t) => t.done).length;

  function addTask() {
    const text = newTask.trim();
    if (!text) return;
    onUpdate({ ...list, tasks: [...list.tasks, { text, done: false }] });
    setNewTask("");
  }

  function toggleTask(idx: number) {
    const tasks = list.tasks.map((t, i) =>
      i === idx ? { ...t, done: !t.done } : t
    );
    onUpdate({ ...list, tasks });
  }

  function updateText(idx: number, text: string) {
    const tasks = list.tasks.map((t, i) =>
      i === idx ? { ...t, text } : t
    );
    onUpdate({ ...list, tasks });
  }

  function removeTask(idx: number) {
    onUpdate({ ...list, tasks: list.tasks.filter((_, i) => i !== idx) });
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="text-muted hover:text-accent transition-colors p-1 cursor-pointer"
          aria-label="Terug"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold truncate">{list.title}</h2>
          {total > 0 && (
            <p className="text-sm text-muted">{completed}/{total} klaar</p>
          )}
        </div>
        <button
          onClick={() => {
            if (confirm(`"${list.title}" verwijderen?`)) onDelete(list.slug);
          }}
          className="text-muted hover:text-danger transition-colors text-sm px-3 py-1.5 rounded-lg border border-border hover:border-danger cursor-pointer"
        >
          Verwijder
        </button>
      </div>

      {/* Progress */}
      {total > 0 && (
        <div className="w-full bg-border rounded-full h-1.5 mb-6 overflow-hidden">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${(completed / total) * 100}%` }}
          />
        </div>
      )}

      {/* Add task form */}
      <form onSubmit={(e) => { e.preventDefault(); addTask(); }} className="flex gap-2 mb-6">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          placeholder="Nieuwe taak..."
          className="flex-1 px-4 py-2.5 rounded-lg border border-border focus:border-accent focus:outline-none bg-surface text-foreground placeholder:text-muted"
        />
        <button
          type="submit"
          disabled={!newTask.trim()}
          className="px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium cursor-pointer"
        >
          Toevoegen
        </button>
      </form>

      {/* Tasks */}
      {list.tasks.length === 0 ? (
        <p className="text-center text-muted py-12">
          Nog geen taken. Voeg je eerste taak toe hierboven.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {list.tasks.map((task, idx) => (
            <TaskItem
              key={`${idx}-${task.text}`}
              text={task.text}
              done={task.done}
              onToggle={() => toggleTask(idx)}
              onUpdate={(text) => updateText(idx, text)}
              onDelete={() => removeTask(idx)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
