import { Suspense } from "react";
import Chat from "@/components/Chat";
import { I18nProvider } from "@/lib/i18n/context";
import ErrorBoundary from "@/components/ErrorBoundary";

export default function Home() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <Suspense fallback={null}>
          <Chat />
        </Suspense>
      </I18nProvider>
    </ErrorBoundary>
  );
}
