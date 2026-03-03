"use client";

import { useEffect, useState, useCallback } from "react";
import ListCard from "@/components/gtd/ListCard";
import TaskList from "@/components/gtd/TaskList";

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

export default function Home() {
  const [lists, setLists] = useState<GtdList[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);

  /* ---- fetch all lists ---- */
  const fetchLists = useCallback(async () => {
    const res = await fetch("/api/gtd");
    if (res.ok) setLists(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  /* ---- create list ---- */
  async function createList() {
    const title = newTitle.trim();
    if (!title) return;
    const res = await fetch("/api/gtd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const created: GtdList = await res.json();
      setLists((prev) => [created, ...prev]);
      setNewTitle("");
      setActive(created.slug);
    }
  }

  /* ---- update list (tasks/title) ---- */
  async function updateList(updated: GtdList) {
    // Optimistic update
    setLists((prev) => prev.map((l) => (l.slug === updated.slug ? updated : l)));

    await fetch(`/api/gtd/${updated.slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: updated.title, tasks: updated.tasks }),
    });
  }

  /* ---- delete list ---- */
  async function deleteListBySlug(slug: string) {
    setActive(null);
    setLists((prev) => prev.filter((l) => l.slug !== slug));
    await fetch(`/api/gtd/${slug}`, { method: "DELETE" });
  }

  /* ---- which list is open ---- */
  const activeList = lists.find((l) => l.slug === active) ?? null;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted animate-pulse">Laden...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">GTD</h1>
        <p className="text-muted mt-1">Getting Things Done</p>
      </header>

      {activeList ? (
        /* ---- Detail view ---- */
        <TaskList
          list={activeList}
          onUpdate={updateList}
          onDelete={deleteListBySlug}
          onBack={() => setActive(null)}
        />
      ) : (
        /* ---- Overview ---- */
        <div className="animate-fade-in">
          {/* Create new list */}
          <form
            onSubmit={(e) => { e.preventDefault(); createList(); }}
            className="flex gap-2 mb-8"
          >
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Nieuwe lijst..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-border focus:border-accent focus:outline-none bg-surface text-foreground placeholder:text-muted"
            />
            <button
              type="submit"
              disabled={!newTitle.trim()}
              className="px-5 py-2.5 bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium cursor-pointer"
            >
              Aanmaken
            </button>
          </form>

          {/* Lists */}
          {lists.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted text-lg mb-2">Nog geen lijsten</p>
              <p className="text-muted text-sm">
                Maak je eerste lijst aan hierboven.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {lists.map((list) => (
                <ListCard
                  key={list.slug}
                  list={list}
                  onClick={() => setActive(list.slug)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-muted">
        Data opgeslagen als markdown in <code className="bg-surface px-1.5 py-0.5 rounded">data/*.md</code>
      </footer>
    </main>
  );
}
