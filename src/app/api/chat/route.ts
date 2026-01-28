import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getDocumentContext } from "@/lib/documents";

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

    // Load knowledge base documents (cached)
    let documentContext;
    try {
      documentContext = await getDocumentContext();
    } catch (err) {
      console.error("Failed to load document context:", err);
      documentContext = null;
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    const baseInstruction =
      "You are the E-Flight Virtual Ops assistant for E-Flight Academy. " +
      "You MUST answer questions ONLY based on the provided knowledge base documents. " +
      "If the answer cannot be found in the documents, clearly state that you don't have that information. " +
      "Do not make up or infer information beyond what is explicitly stated in the documents. " +
      "Always be helpful and professional.";

    const systemInstruction = documentContext?.systemInstructionText
      ? `${baseInstruction}\n\nKnowledge Base Documents:\n\n${documentContext.systemInstructionText}`
      : baseInstruction;

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
