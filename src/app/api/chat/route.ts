import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents";
import { getConfig } from "@/lib/config";
import { getFaqs, buildFaqContext } from "@/lib/faq";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const { messages } = await request.json();

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Load config, FAQs, and Drive context in parallel
    const [config, faqs, documentContext] = await Promise.all([
      getConfig().catch((err) => {
        console.error("Failed to load config:", err);
        return null;
      }),
      getFaqs().catch((err) => {
        console.error("Failed to load FAQs:", err);
        return [];
      }),
      getDocumentContext().catch((err) => {
        console.error("Failed to load document context:", err);
        return null;
      }),
    ]);

    const searchOrder = config?.search_order ?? ["faq", "drive"];
    const toneOfVoice = config?.tone_of_voice ?? "professional, friendly, and helpful";
    const companyContext = config?.company_context ?? "E-Flight Academy is a flight training academy.";

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

    searchSteps.push(
      `${stepNum}. If the answer cannot be found in any of the provided sources, clearly state that you don't have that information and suggest the user contact E-Flight Academy directly.`
    );

    instructionParts.push(
      "Follow this search order to answer questions:",
      ...searchSteps,
      "Do not make up or infer information beyond what is explicitly stated in the provided sources."
    );

    // Append FAQ context
    if (searchOrder.includes("faq") && faqs.length > 0) {
      instructionParts.push("", buildFaqContext(faqs));
    }

    // Append Drive document context
    if (searchOrder.includes("drive") && documentContext?.systemInstructionText) {
      instructionParts.push(
        "",
        "=== Knowledge Base Documents ===",
        documentContext.systemInstructionText
      );
    }

    const systemInstruction = instructionParts.join("\n");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction,
    });

    // Build chat history
    // If we have binary file parts, inject them as the first exchange
    const fileContextHistory: { role: string; parts: unknown[] }[] = [];
    if (documentContext?.fileParts.length) {
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
    const userHistory = messages
      .slice(0, -1)
      .map((msg: { role: string; content: string }) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

    const history = [...fileContextHistory, ...userHistory];

    const chat = model.startChat({ history });

    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ message: text });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate response: ${message}` },
      { status: 500 }
    );
  }
}
