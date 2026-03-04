import type { FlowOption } from "@/types/chat";

interface FlowOptionsProps {
  options: FlowOption[];
  onSelect: (stepName: string, displayLabel: string) => void;
  getFlowLabel: (option: FlowOption) => string;
  kiosk?: boolean;
  capabilities?: string[];
}

export default function FlowOptions({ options, onSelect, getFlowLabel, kiosk, capabilities = [] }: FlowOptionsProps) {
  // Filter out options that require a capability the user doesn't have
  const visibleOptions = options.filter(
    (o) => !o.capability || capabilities.includes(o.capability)
  );

  return (
    <div role="group" aria-label="Options" className="flex flex-wrap gap-2">
      {visibleOptions.map((option, i) => (
        <button
          key={i}
          onClick={() => onSelect(option.name, getFlowLabel(option))}
          className={`font-semibold rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer ${kiosk ? "text-lg px-5 py-3" : "text-base px-4 py-2"}`}
        >
          {/* eslint-disable @next/next/no-img-element */}
          {option.icon && (
            option.icon.startsWith("http") ? (
              <img src={option.icon} alt="" className="w-5 h-5" />
            ) : (
              <span>{option.icon}</span>
            )
          )}
          {/* eslint-enable @next/next/no-img-element */}
          {getFlowLabel(option)}
        </button>
      ))}
    </div>
  );
}
