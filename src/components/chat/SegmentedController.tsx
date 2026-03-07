"use client";

interface Tab {
  key: string;
  label: string;
  count?: number;
}

interface SegmentedControllerProps {
  tabs: Tab[];
  activeKey: string;
  onSelect: (key: string) => void;
}

export default function SegmentedController({ tabs, activeKey, onSelect }: SegmentedControllerProps) {
  return (
    <div className="flex bg-[#F2F2F2] dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onSelect(tab.key)}
          className={`flex-1 text-xs font-medium py-1.5 px-2 rounded-md transition-all cursor-pointer truncate ${
            activeKey === tab.key
              ? "bg-white dark:bg-gray-900 text-foreground shadow-sm"
              : "text-e-grey hover:text-foreground"
          }`}
        >
          {tab.label}
          {tab.count != null && (
            <span className={`ml-1 ${activeKey === tab.key ? "text-e-grey" : "text-[#ABABAB]"}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
