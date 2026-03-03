"use client";

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
  onClick: () => void;
}

export default function ListCard({ list, onClick }: Props) {
  const total = list.tasks.length;
  const completed = list.tasks.filter((t) => t.done).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 bg-surface rounded-xl border border-border hover:border-accent/40 hover:shadow-sm transition-all group cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-lg truncate group-hover:text-accent transition-colors">
            {list.title}
          </h3>
          <p className="text-sm text-muted mt-1">
            {total === 0
              ? "Geen taken"
              : `${completed}/${total} klaar`}
          </p>
        </div>
        {total > 0 && (
          <span className="text-xs font-medium text-muted bg-background px-2 py-1 rounded-md">
            {pct}%
          </span>
        )}
      </div>

      {/* Mini progress bar */}
      {total > 0 && (
        <div className="w-full bg-border rounded-full h-1 mt-3 overflow-hidden">
          <div
            className="bg-accent h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </button>
  );
}
