import Chat from "@/components/Chat";
import { I18nProvider } from "@/lib/i18n/context";

export default function Home() {
  return (
    <I18nProvider>
      <Chat />
    </I18nProvider>
  );
}
