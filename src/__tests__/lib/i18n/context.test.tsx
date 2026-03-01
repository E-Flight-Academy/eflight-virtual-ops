import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { I18nProvider, useI18n } from "@/lib/i18n/context";
import { DEFAULT_LABELS } from "@/lib/i18n/labels";
import type { UiLabels } from "@/lib/i18n/labels";

// Test component that exposes i18n values
function TestConsumer() {
  const { lang, t, setTranslations, resetLanguage } = useI18n();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="welcome">{t("chat.welcome")}</span>
      <button
        data-testid="set-nl"
        onClick={() =>
          setTranslations("nl", {
            ...DEFAULT_LABELS,
            "chat.welcome": "Welkom bij Steward!",
          } as UiLabels)
        }
      >
        Set NL
      </button>
      <button data-testid="reset" onClick={resetLanguage}>
        Reset
      </button>
    </div>
  );
}

describe("I18nProvider", () => {
  it("renders children", () => {
    render(
      <I18nProvider>
        <span>child content</span>
      </I18nProvider>
    );
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("provides default lang=en", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("provides default labels via t()", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>
    );
    expect(screen.getByTestId("welcome").textContent).toBe("Welcome to Steward!");
  });

  it("updates labels via setTranslations", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>
    );

    act(() => {
      screen.getByTestId("set-nl").click();
    });

    expect(screen.getByTestId("lang").textContent).toBe("nl");
    expect(screen.getByTestId("welcome").textContent).toBe("Welkom bij Steward!");
  });

  it("resets to English via resetLanguage", () => {
    render(
      <I18nProvider>
        <TestConsumer />
      </I18nProvider>
    );

    act(() => {
      screen.getByTestId("set-nl").click();
    });
    expect(screen.getByTestId("lang").textContent).toBe("nl");

    act(() => {
      screen.getByTestId("reset").click();
    });
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(screen.getByTestId("welcome").textContent).toBe("Welcome to Steward!");
  });
});

describe("useI18n outside provider", () => {
  it("returns default values from context", () => {
    function Bare() {
      const { lang, t } = useI18n();
      return (
        <div>
          <span data-testid="bare-lang">{lang}</span>
          <span data-testid="bare-t">{t("chat.send")}</span>
        </div>
      );
    }
    render(<Bare />);
    expect(screen.getByTestId("bare-lang").textContent).toBe("en");
    expect(screen.getByTestId("bare-t").textContent).toBe("Send");
  });
});
