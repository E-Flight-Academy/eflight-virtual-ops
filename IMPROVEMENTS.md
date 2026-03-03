# Improvements

Geplande verbeteringen voor het Steward project.

## 3.1 Chat.tsx opsplitsen (84KB is te groot)

- Splits in: `ChatContainer`, `MessageList`, `MessageBubble`, `ChatInput`, `RatingWidget`, `FlowStepper`, `TypingIndicator`
- Verplaats interfaces naar `src/types/chat.ts`
- Extract custom hooks: `useChat`, `useFlow`, `useRating`, `useKbStatus`

## 3.2 Error handling verbeteren

- Voeg een centrale error boundary component toe
- Retry logic voor API calls (exponential backoff)
- Betere gebruikersfeedback bij netwerk/API fouten

## 3.3 Performance optimalisaties

- Lazy loading voor FaqModal en zware componenten
- Debounce op chat input
- Virtualized scrolling voor lange message lists
- Image/asset optimalisatie met next/image

## 3.4 Accessibility (a11y)

- ARIA labels op alle interactieve elementen
- Keyboard navigatie voor FAQ modal en dropdowns
- Focus management bij modal open/close
- Screen reader support voor chat berichten

## 3.5 Type safety versterken

- Shared types package voor KV cache types
- Zod validation op API route inputs
- Stricter TypeScript config (noUncheckedIndexedAccess)

## 3.6 Monitoring & observability

- Structured logging (pino of winston)
- Error tracking (Sentry integratie)
- API response time metrics
- Cache hit/miss ratio tracking
