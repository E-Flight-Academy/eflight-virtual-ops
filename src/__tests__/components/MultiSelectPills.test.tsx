import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MultiSelectPills from "@/components/chat/MultiSelectPills";

const options = ["Training", "Aircraft", "Pricing"];
const defaultProps = {
  options,
  onConfirm: vi.fn(),
  confirmLabel: "Continue",
};

describe("MultiSelectPills", () => {
  it("renders all options as buttons", () => {
    render(<MultiSelectPills {...defaultProps} />);
    for (const opt of options) {
      expect(screen.getByText(opt)).toBeInTheDocument();
    }
  });

  it("does not show confirm button initially", () => {
    render(<MultiSelectPills {...defaultProps} />);
    expect(screen.queryByText("Continue →")).not.toBeInTheDocument();
  });

  it("shows confirm button after selecting an option", () => {
    render(<MultiSelectPills {...defaultProps} />);
    fireEvent.click(screen.getByText("Training"));
    expect(screen.getByText("Continue →")).toBeInTheDocument();
  });

  it("hides confirm button after deselecting all options", () => {
    render(<MultiSelectPills {...defaultProps} />);
    fireEvent.click(screen.getByText("Training"));
    expect(screen.getByText("Continue →")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Training")); // deselect
    expect(screen.queryByText("Continue →")).not.toBeInTheDocument();
  });

  it("calls onConfirm with selected items", () => {
    const onConfirm = vi.fn();
    render(<MultiSelectPills {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Training"));
    fireEvent.click(screen.getByText("Pricing"));
    fireEvent.click(screen.getByText("Continue →"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    const arg = onConfirm.mock.calls[0][0] as string[];
    expect(arg).toContain("Training");
    expect(arg).toContain("Pricing");
    expect(arg).not.toContain("Aircraft");
  });

  it("toggles selection on repeated clicks", () => {
    const onConfirm = vi.fn();
    render(<MultiSelectPills {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText("Training"));
    fireEvent.click(screen.getByText("Aircraft"));
    fireEvent.click(screen.getByText("Training")); // deselect
    fireEvent.click(screen.getByText("Continue →"));
    const arg = onConfirm.mock.calls[0][0] as string[];
    expect(arg).toEqual(["Aircraft"]);
  });

  it("uses the provided confirmLabel", () => {
    render(<MultiSelectPills {...defaultProps} confirmLabel="Bevestig" />);
    fireEvent.click(screen.getByText("Training"));
    expect(screen.getByText("Bevestig →")).toBeInTheDocument();
  });
});
