import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents";
import { getConfig } from "@/lib/config";
import { getFaqs, buildFaqContext } from "@/lib/faq";
import { getWebsiteContent, buildWebsiteContext } from "@/lib/website";
import { detectLanguage } from "@/lib/i18n/detect";
import { getTranslations } from "@/lib/i18n/translate";

export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function POST(request: NextRequest) {
  try {
    const { messages, lang: clientLang, flowContext } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Load config, FAQs, and Drive context in parallel (with timeouts)
    const [config, faqs, documentContext] = await Promise.all([
      withTimeout(
        getConfig().catch((err) => { console.error("Failed to load config:", err); return null; }),
        5000, null
      ),
      withTimeout(
        getFaqs().catch((err) => { console.error("Failed to load FAQs:", err); return [] as never[]; }),
        5000, []
      ),
      withTimeout(
        getDocumentContext().catch((err) => { console.error("Failed to load document context:", err); return null; }),
        10000, null
      ),
    ]);

    const searchOrder = config?.search_order ?? ["faq", "drive"];
    const toneOfVoice = config?.tone_of_voice ?? "professional, friendly, and helpful";
    const companyContext = config?.company_context ?? "E-Flight Academy is a flight training academy.";
    const fallbackInstruction = config?.fallback_instruction ?? "If the answer cannot be found in any of the provided sources, you may use your general knowledge to answer, but clearly state that the information does not come from E-Flight Academy's official documents or FAQs.";

    // Load website content (needs config for URL list; L1 cache makes this near-instant)
    const websitePages = await withTimeout(
      getWebsiteContent(config?.website_pages).catch((err) => {
        console.error("Failed to load website content:", err);
        return [] as never[];
      }),
      10000, []
    );

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Build system instruction based on search_order
    const instructionParts: string[] = [];

    instructionParts.push(
      `You are the E-Flight Virtual Ops assistant. ${companyContext}`,
      `Your tone of voice is: ${toneOfVoice}.`,
    );

    // Build search priority instructions
    const searchSteps: string[] = [];
    let stepNum = 1;

    if (searchOrder.includes("faq") && faqs.length > 0) {
      searchSteps.push(
        `${stepNum}. FIRST check the FAQ section below. If a FAQ directly answers the question, use that answer.`
      );
      stepNum++;
    }

    if (searchOrder.includes("drive") && documentContext?.systemInstructionText) {
      searchSteps.push(
        `${stepNum}. Check the Knowledge Base Documents for relevant information.`
      );
      stepNum++;
    }

    if (searchOrder.includes("website") && websitePages.length > 0) {
      searchSteps.push(
        `${stepNum}. Check the Website Content section for information from the e-flight.nl website.`
      );
      stepNum++;
    }

    searchSteps.push(
      `${stepNum}. ${fallbackInstruction}`
    );

    instructionParts.push(
      "Follow this search order to answer questions:",
      ...searchSteps,
      "Keep answers concise.",
      "At the very end of every response, on a new line, add a small source tag in this exact format: [source: X] where X is one of: FAQ, Website, Knowledge Base, General Knowledge. Pick the primary source you used for the answer."
    );

    if (clientLang && clientLang !== "en") {
      instructionParts.push(
        `IMPORTANT: Always respond in the same language as the user. The user's preferred language code is: ${clientLang}.`
      );
    }

    // Append guided flow context if present
    if (flowContext && typeof flowContext === "object" && Object.keys(flowContext).length > 0) {
      const contextEntries = Object.entries(flowContext)
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
      instructionParts.push(
        "",
        "=== User Intake Context ===",
        `The user completed a guided intake with the following information: ${contextEntries}`,
        "Use this context to personalize your responses."
      );
    }

    // Append FAQ context
    if (searchOrder.includes("faq") && faqs.length > 0) {
      instructionParts.push("", buildFaqContext(faqs, clientLang || "nl"));
    }

    // Append Drive document context (text only — in system instruction)
    if (searchOrder.includes("drive") && documentContext?.systemInstructionText) {
      instructionParts.push(
        "",
        "=== Knowledge Base Documents ===",
        documentContext.systemInstructionText
      );
    }

    // Append Website context
    if (searchOrder.includes("website") && websitePages.length > 0) {
      instructionParts.push("", buildWebsiteContext(websitePages));
    }

    const systemInstruction = instructionParts.join("\n");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction,
      generationConfig: { temperature: 0.5 },
    });

    // Build chat history
    // Only include binary file parts on the first message to avoid re-processing
    // 21 PDFs on every exchange. On follow-up messages, text context suffices.
    const fileContextHistory: { role: string; parts: unknown[] }[] = [];
    if (messages.length === 1 && documentContext?.fileParts.length) {
      fileContextHistory.push({
        role: "user",
        parts: [
          { text: "Here are additional reference documents for the knowledge base:" },
          ...documentContext.fileParts,
        ],
      });
      fileContextHistory.push({
        role: "model",
        parts: [
          {
            text: "I have received the reference documents. I will use them along with the other knowledge base documents to answer your questions.",
          },
        ],
      });
    }

    // Convert user messages to Gemini format
    const allHistory = messages
      .slice(0, -1)
      .map((msg: { role: string; content: string }) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

    // Gemini requires the first message to be from "user". Drop leading
    // "model" messages (e.g. guided-flow welcome) — that context is already
    // captured in the system instruction via flowContext.
    const firstUserIdx = allHistory.findIndex((m: { role: string }) => m.role === "user");
    const userHistory = firstUserIdx >= 0 ? allHistory.slice(firstUserIdx) : [];

    const history = [...fileContextHistory, ...userHistory];

    const chat = model.startChat({ history });

    const lastMessage = messages[messages.length - 1];

    // Detect language on every message (in parallel with chat), but only for
    // messages long enough to be unambiguous (≥10 chars). Short messages like
    // "ok" or "ja" keep the current language.
    const shouldDetect = lastMessage.content.trim().length >= 10;
    const langPromise = shouldDetect
      ? withTimeout(detectLanguage(lastMessage.content), 5000, clientLang || "en")
      : Promise.resolve(clientLang || "en");

    // Wrap Gemini call with timeout (leave margin for response)
    const [geminiResult, detectedLang] = await Promise.all([
      withTimeout(
        (async () => {
          const result = await chat.sendMessage(lastMessage.content);
          const response = await result.response;
          return response.text();
        })(),
        50000,
        null
      ),
      langPromise,
    ]);

    if (geminiResult === null) {
      return NextResponse.json({
        message: "Sorry, the response took too long. Please try again or ask a simpler question.",
      });
    }

    // Include translations when detected language differs from what the frontend has
    const response: Record<string, unknown> = { message: geminiResult };
    const langChanged = detectedLang !== (clientLang || "en");
    if (langChanged) {
      try {
        const translations = detectedLang === "en"
          ? null  // Frontend already has English defaults
          : await withTimeout(getTranslations(detectedLang), 8000, null);
        response.lang = detectedLang;
        if (translations) {
          response.translations = translations;
        }
      } catch {
        // Non-fatal — UI stays in current language
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate response: ${message}` },
      { status: 500 }
    );
  }
}
