import type { FlowOption } from "@/types/chat";

interface FlowOptionsProps {
  options: FlowOption[];
  onSelect: (stepName: string, displayLabel: string) => void;
  getFlowLabel: (option: FlowOption) => string;
}

export default function FlowOptions({ options, onSelect, getFlowLabel }: FlowOptionsProps) {
  return (
    <div role="group" aria-label="Options" className="flex flex-wrap gap-2">
      {options.map((option, i) => (
        <button
          key={i}
          onClick={() => onSelect(option.name, getFlowLabel(option))}
          className="text-base font-semibold px-4 py-2 rounded-full border border-[#ECECEC] bg-[#F7F7F7] text-[#030213] hover:bg-[#1515F5] hover:text-white hover:border-[#1515F5] transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          {option.icon && (
            option.icon.startsWith("http") ? (
              <img src={option.icon} alt="" className="w-5 h-5" />
            ) : (
              <span>{option.icon}</span>
            )
          )}
          {getFlowLabel(option)}
        </button>
      ))}
    </div>
  );
}
