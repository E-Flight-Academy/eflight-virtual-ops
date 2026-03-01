import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import FaqModal from "@/components/FaqModal";

interface Faq {
  question: string;
  questionNl: string;
  questionDe: string;
  answer: string;
  answerNl: string;
  answerDe: string;
  category: string;
  audience: string[];
}

function makeFaq(overrides: Partial<Faq> = {}): Faq {
  return {
    question: "What is E-Flight?",
    questionNl: "Wat is E-Flight?",
    questionDe: "Was ist E-Flight?",
    answer: "An academy",
    answerNl: "Een academie",
    answerDe: "Eine Akademie",
    category: "Training",
    audience: ["Student"],
    ...overrides,
  };
}

const defaultProps = {
  faqs: [makeFaq()],
  lang: "en",
  onClose: vi.fn(),
  onSelectFaq: vi.fn(),
};

describe("FaqModal", () => {
  it("renders the FAQ header", () => {
    render(<FaqModal {...defaultProps} />);
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
  });

  it("shows English questions by default", () => {
    render(<FaqModal {...defaultProps} />);
    expect(screen.getByText("What is E-Flight?")).toBeInTheDocument();
  });

  it("shows Dutch questions when lang=nl", () => {
    render(<FaqModal {...defaultProps} lang="nl" />);
    expect(screen.getByText("Wat is E-Flight?")).toBeInTheDocument();
  });

  it("shows German questions when lang=de", () => {
    render(<FaqModal {...defaultProps} lang="de" />);
    expect(screen.getByText("Was ist E-Flight?")).toBeInTheDocument();
  });

  it("calls onSelectFaq when a question is clicked", () => {
    const onSelectFaq = vi.fn();
    render(<FaqModal {...defaultProps} onSelectFaq={onSelectFaq} />);
    fireEvent.click(screen.getByText("What is E-Flight?"));
    expect(onSelectFaq).toHaveBeenCalledWith("What is E-Flight?");
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<FaqModal {...defaultProps} onClose={onClose} />);
    // The close button has an SVG with x icon - find the button in the header
    const header = screen.getByText("Frequently Asked Questions").closest("div");
    const closeButton = header!.querySelector("button");
    fireEvent.click(closeButton!);
    expect(onClose).toHaveBeenCalled();
  });

  it("filters questions based on search input", () => {
    const faqs = [
      makeFaq({ question: "What is E-Flight?" }),
      makeFaq({ question: "How to charge?" }),
    ];
    render(<FaqModal {...defaultProps} faqs={faqs} />);

    const searchInput = screen.getByPlaceholderText("Search questions...");
    fireEvent.change(searchInput, { target: { value: "charge" } });

    expect(screen.queryByText("What is E-Flight?")).not.toBeInTheDocument();
    expect(screen.getByText("How to charge?")).toBeInTheDocument();
  });

  it("shows no results message when search matches nothing", () => {
    render(<FaqModal {...defaultProps} />);
    const searchInput = screen.getByPlaceholderText("Search questions...");
    fireEvent.change(searchInput, { target: { value: "zzzznonexistent" } });
    expect(screen.getByText("No matching questions found")).toBeInTheDocument();
  });

  it("displays category badges on FAQ items", () => {
    const faqs = [makeFaq({ category: "Training" })];
    render(<FaqModal {...defaultProps} faqs={faqs} />);
    // Category appears as badge text and also in the dropdown
    expect(getAllByTextSafe(screen, "Training").length).toBeGreaterThanOrEqual(1);
  });

  it("displays audience badges on FAQ items", () => {
    const faqs = [makeFaq({ audience: ["Student"] })];
    render(<FaqModal {...defaultProps} faqs={faqs} />);
    // Audience appears as badge text and also in the dropdown
    expect(getAllByTextSafe(screen, "Student").length).toBeGreaterThanOrEqual(1);
  });
});

// Helper to handle multiple matches (badges + dropdown items)
function getAllByTextSafe(
  scr: typeof screen,
  text: string
) {
  return scr.getAllByText(text);
}
