import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FaqModal from "@/components/FaqModal";

const mockFaqs = [
  {
    question: "What aircraft do you use?",
    questionNl: "Welk vliegtuig gebruiken jullie?",
    questionDe: "Welches Flugzeug benutzt ihr?",
    answer: "We fly the Pipistrel Velis Electro.",
    answerNl: "We vliegen met de Pipistrel Velis Electro.",
    answerDe: "Wir fliegen mit der Pipistrel Velis Electro.",
    category: "Aircraft",
    audience: ["Student"],
  },
  {
    question: "How much does training cost?",
    questionNl: "Hoeveel kost de opleiding?",
    questionDe: "Wie viel kostet die Ausbildung?",
    answer: "Contact us for pricing.",
    answerNl: "Neem contact met ons op voor de prijs.",
    answerDe: "Kontaktieren Sie uns für die Preise.",
    category: "Pricing",
    audience: ["Visitor"],
  },
];

describe("FaqModal", () => {
  it("renders the FAQ header", () => {
    render(
      <FaqModal faqs={mockFaqs} lang="en" onClose={vi.fn()} onSelectFaq={vi.fn()} />
    );
    expect(screen.getByText("Frequently Asked Questions")).toBeInTheDocument();
  });

  it("displays FAQ questions in English", () => {
    render(
      <FaqModal faqs={mockFaqs} lang="en" onClose={vi.fn()} onSelectFaq={vi.fn()} />
    );
    expect(screen.getByText("What aircraft do you use?")).toBeInTheDocument();
    expect(screen.getByText("How much does training cost?")).toBeInTheDocument();
  });

  it("displays FAQ questions in Dutch when lang is nl", () => {
    render(
      <FaqModal faqs={mockFaqs} lang="nl" onClose={vi.fn()} onSelectFaq={vi.fn()} />
    );
    expect(screen.getByText("Welk vliegtuig gebruiken jullie?")).toBeInTheDocument();
    expect(screen.getByText("Hoeveel kost de opleiding?")).toBeInTheDocument();
  });

  it("calls onSelectFaq when a question is clicked", async () => {
    const user = userEvent.setup();
    const onSelectFaq = vi.fn();
    render(
      <FaqModal faqs={mockFaqs} lang="en" onClose={vi.fn()} onSelectFaq={onSelectFaq} />
    );

    await user.click(screen.getByText("What aircraft do you use?"));
    expect(onSelectFaq).toHaveBeenCalledWith("What aircraft do you use?");
  });

  it("filters FAQs based on search input", async () => {
    const user = userEvent.setup();
    render(
      <FaqModal faqs={mockFaqs} lang="en" onClose={vi.fn()} onSelectFaq={vi.fn()} />
    );

    await user.type(screen.getByPlaceholderText("Search questions..."), "aircraft");
    expect(screen.getByText("What aircraft do you use?")).toBeInTheDocument();
    expect(screen.queryByText("How much does training cost?")).not.toBeInTheDocument();
  });

  it("shows empty state when no FAQs match search", async () => {
    const user = userEvent.setup();
    render(
      <FaqModal faqs={mockFaqs} lang="en" onClose={vi.fn()} onSelectFaq={vi.fn()} />
    );

    await user.type(screen.getByPlaceholderText("Search questions..."), "zzzzz");
    expect(screen.getByText("No matching questions found")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <FaqModal faqs={mockFaqs} lang="en" onClose={onClose} onSelectFaq={vi.fn()} />
    );

    // The close button is the one with the SVG X icon
    const closeButtons = screen.getAllByRole("button");
    // First button in the header is the close button
    const closeButton = closeButtons[0];
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalled();
  });
});
