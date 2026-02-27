import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getRelevantDocuments, getBinaryDocumentContext } from "@/lib/documents";
import { getConfig } from "@/lib/config";
import { getFaqs, buildFaqContext } from "@/lib/faq";
import { getWebsiteContent, buildWebsiteContext } from "@/lib/website";
import { getProducts, buildProductsContext } from "@/lib/shopify";
import { detectLanguage } from "@/lib/i18n/detect";
import { getTranslations } from "@/lib/i18n/translate";
import { getSession, fetchCustomerOrders, buildOrdersContext, type ShopifyOrder } from "@/lib/shopify-auth";
import { getUserRoles } from "@/lib/airtable";
import { getFoldersForRoles } from "@/lib/role-access";

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

    // Get user roles and access token for document filtering and order fetching
    let userRoles: string[] = [];
    let accessToken: string | null = null;
    try {
      const session = await getSession();
      if (session?.customer?.email) {
        userRoles = await getUserRoles(session.customer.email);
        accessToken = session.accessToken;
      }
    } catch (err) {
      console.warn("Failed to get user roles:", err);
    }

    // Get allowed folders based on roles (defaults to ["public"] for anonymous)
    const allowedFolders = await getFoldersForRoles(userRoles);
    console.log(`Chat: user roles [${userRoles.join(", ")}] → folders [${allowedFolders.join(", ")}]`);

    const lastMessage = messages[messages.length - 1];

    // Load all data sources in parallel (with timeouts)
    const [config, faqs, ragResult, binaryContext, websitePages, products, orders] = await Promise.all([
      withTimeout(
        getConfig().catch((err) => { console.error("Failed to load config:", err); return null; }),
        5000, null
      ),
      withTimeout(
        getFaqs().catch((err) => { console.error("Failed to load FAQs:", err); return [] as never[]; }),
        5000, []
      ),
      withTimeout(
        getRelevantDocuments(lastMessage.content, allowedFolders).catch((err) => { console.error("Failed to load RAG context:", err); return null; }),
        10000, null
      ),
      withTimeout(
        getBinaryDocumentContext(allowedFolders).catch((err) => { console.error("Failed to load binary context:", err); return null; }),
        10000, null
      ),
      withTimeout(
        getWebsiteContent().catch((err) => {
          console.error("Failed to load website content:", err);
          return [] as never[];
        }),
        10000, []
      ),
      withTimeout(
        getProducts().catch((err) => {
          console.error("Failed to load products:", err);
          return [] as never[];
        }),
        5000, []
      ),
      withTimeout(
        accessToken
          ? fetchCustomerOrders(accessToken).catch((err) => {
              console.error("Failed to fetch orders:", err);
              return [] as ShopifyOrder[];
            })
          : Promise.resolve([] as ShopifyOrder[]),
        5000, [] as ShopifyOrder[]
      ),
    ]);

    const searchOrder = config?.search_order ?? ["faq", "drive"];
    const toneOfVoice = config?.tone_of_voice ?? "professional, friendly, and helpful";
    const companyContext = config?.company_context ?? "E-Flight Academy is a flight training academy.";
    const fallbackInstruction = config?.fallback_instruction ?? "If the answer cannot be found in any of the provided sources, you may use your general knowledge to answer, but clearly state that the information does not come from E-Flight Academy's official documents or FAQs.";
    const systemInstructions = (config as Record<string, unknown>)?.system_instructions as string | undefined;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // Build system instruction based on search_order
    const instructionParts: string[] = [];

    instructionParts.push(
      `You are the Steward assistant. ${companyContext}`,
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

    if (searchOrder.includes("drive") && ragResult?.systemInstructionText) {
      searchSteps.push(
        `${stepNum}. Check the Knowledge Base Documents for relevant information.`
      );
      stepNum++;
    }

    if (searchOrder.includes("website") && websitePages.length > 0) {
      searchSteps.push(
        `${stepNum}. Check the Website Content section for information from the E-Flight Academy website.`
      );
      stepNum++;
    }

    if (products.length > 0) {
      searchSteps.push(
        `${stepNum}. For questions about products, merchandise, or prices, refer to the Shop Products section.`
      );
      stepNum++;
    }

    if (orders.length > 0) {
      searchSteps.push(
        `${stepNum}. For questions about the customer's orders, purchases, or booking status, refer to the Customer Order History section.`
      );
      stepNum++;
    }

    searchSteps.push(
      `${stepNum}. ${fallbackInstruction}`
    );

    instructionParts.push(
      "Follow this search order to answer questions:",
      ...searchSteps,
    );

    // Append custom system instructions from Notion config
    if (systemInstructions) {
      instructionParts.push("", systemInstructions);
    }

    // Fixed formatting rules (always applied)
    instructionParts.push(
      "IMPORTANT: When mentioning URLs, email addresses, or phone numbers, always format them as clickable markdown links. For websites use [visible text](https://example.com). For email addresses always show the full address as link text: [info@eflight.nl](mailto:info@eflight.nl). For phone numbers always show the full number as link text: [055 203 2230](tel:+31552032230). When referring someone to contact E-Flight by phone, ALSO mention WhatsApp as an option and include the link: [WhatsApp](https://wa.me/31552032230). Never hide the address or number behind generic words like 'email' or 'phone'. Never use raw HTML tags.",
      "LINK CARDS: When your answer references a relevant page, include one or more [link: url | label] tags at the END of your response (before the [source: ...] tag). These render as clickable cards. Use a short, action-oriented label in the user's language. Common links: brochure → https://www.eflight.nl/pages/download-brochure, trial lesson → https://www.eflight.nl/products/proefles, book lessons → https://www.eflight.nl/pages/ppl-lessen-en-theorie-boeken, plan lessons → https://www.eflight.nl/pages/plan-je-lessen, contact → https://www.eflight.nl/pages/contact. Only include links that are directly relevant to the answer.",
      "MANDATORY: You MUST end EVERY response with a source tag on a new line. Format: [source: X] where X is one of: FAQ, Website, Products, Orders, Knowledge Base, General Knowledge. When the source is Website, include the page URL like this: [source: Website | https://www.eflight.nl/page]. When the source is FAQ, include the original FAQ question (in English) like this: [source: FAQ | What does the training cost?]. When the source is Products (Shop Products & Prices section), include the product URL like this: [source: Products | https://www.eflight.nl/products/product-name]. If the answer comes from a FAQ entry, ALWAYS use FAQ as the source, even if similar information exists on the website. If the answer is about product pricing from the Shop Products section, use Products as the source. This is required for every single response without exception."
    );

    instructionParts.push(
      `MANDATORY: Always respond in the SAME language as the user's message. If the user writes in Dutch, you MUST respond in Dutch. If in German, respond in German. If in English, respond in English. The user's current language preference is: ${clientLang || "en"}. Never say you cannot respond in a language - just respond in whatever language the user uses.`
    );

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
      instructionParts.push("", buildFaqContext(faqs, clientLang || "en"));
    }

    // Append Drive document context (RAG excerpts or full text fallback)
    if (searchOrder.includes("drive") && ragResult?.systemInstructionText) {
      instructionParts.push(
        "",
        "=== Knowledge Base Documents (most relevant excerpts) ===",
        ragResult.systemInstructionText
      );
    }

    // Append Website context
    if (searchOrder.includes("website") && websitePages.length > 0) {
      instructionParts.push("", buildWebsiteContext(websitePages));
    }

    // Append Products context
    if (products.length > 0) {
      instructionParts.push("", buildProductsContext(products));
    }

    // Append Orders context (only for authenticated users)
    if (orders.length > 0) {
      instructionParts.push("", buildOrdersContext(orders));
    } else if (!accessToken) {
      instructionParts.push(
        "",
        "NOTE: The user is NOT logged in. If they ask about their orders, purchases, bookings, or account information, tell them they need to log in first to view their order history. Mention they can log in using the login button in the top right corner of the screen."
      );
    }

    const systemInstruction = instructionParts.join("\n");

    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction,
      generationConfig: { temperature: 0.5 },
    });

    // Build chat history
    // Only include binary file parts on the first message to avoid re-processing
    // scanned PDFs on every exchange. On follow-up messages, text context suffices.
    const fileContextHistory: { role: string; parts: unknown[] }[] = [];
    if (messages.length === 1 && binaryContext?.fileParts.length) {
      fileContextHistory.push({
        role: "user",
        parts: [
          { text: "Here are additional reference documents for the knowledge base:" },
          ...binaryContext.fileParts,
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

    // Detect language in parallel with streaming (resolve before stream ends)
    const shouldDetect = lastMessage.content.trim().length >= 10;
    const langPromise = shouldDetect
      ? withTimeout(detectLanguage(lastMessage.content), 5000, clientLang || "en")
      : Promise.resolve(clientLang || "en");

    // Start streaming response from Gemini
    const streamResult = await chat.sendMessageStream(lastMessage.content);

    const encoder = new TextEncoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            fullText += text;
            controller.enqueue(encoder.encode(JSON.stringify({ type: "chunk", text }) + "\n"));
          }

          // Post-process: ensure [source: Website] tags include the page URL and title
          let processedSource: string | null = null;
          let sourceTitle: string | null = null;
          let sourceUrl: string | null = null;
          const websiteSourceMatch = fullText.match(/\[source:\s*Website\s*(?:\|\s*(https?:\/\/[^\s\]|]+))?\s*(?:\|[^\]]*)?\]/i);
          if (websitePages.length > 0 && websiteSourceMatch) {
            const geminiUrl = websiteSourceMatch[1]?.trim();

            // First try: exact URL match
            let bestPage = geminiUrl ? websitePages.find(p => p.url === geminiUrl) : undefined;
            // Second try: partial URL match (but not just domain root)
            if (!bestPage && geminiUrl) {
              bestPage = websitePages.find(p => p.url.length > 30 && (geminiUrl.includes(p.url) || p.url.includes(geminiUrl)));
            }

            if (bestPage) {
              sourceUrl = bestPage.url;
              sourceTitle = bestPage.title;
            } else if (geminiUrl) {
              // URL not in cache — use Gemini's URL directly, derive title from path
              sourceUrl = geminiUrl;
              const pathSegment = geminiUrl.split("/").pop() || "";
              sourceTitle = pathSegment.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
            } else {
              // No URL from Gemini — fall back to word-matching
              const responseText = fullText.replace(/\[source:[^\]]*\]/gi, "").toLowerCase();
              const responseWords = responseText.split(/\s+/).filter((w) => w.length > 4);
              let fallbackPage = websitePages[0];
              let bestScore = 0;
              for (const page of websitePages) {
                const pageWords = new Set(page.content.toLowerCase().split(/\s+/).filter((w) => w.length > 4));
                let score = 0;
                for (const word of responseWords) { if (pageWords.has(word)) score++; }
                if (score > bestScore) { bestScore = score; fallbackPage = page; }
              }
              sourceUrl = fallbackPage.url;
              sourceTitle = fallbackPage.title;
            }

            processedSource = `[source: Website | ${sourceUrl} | ${sourceTitle}]`;
          }

          // Post-process: ensure [source: Products] tags include proper URL and title
          const productsSourceMatch = fullText.match(/\[source:\s*Products?\s*(?:\|\s*(https?:\/\/[^\s\]|]+))?\s*(?:\|[^\]]*)?\]/i);
          if (!processedSource && productsSourceMatch && products.length > 0) {
            const geminiProductUrl = productsSourceMatch[1]?.trim();
            let matchedProduct = geminiProductUrl
              ? products.find(p => p.url === geminiProductUrl || p.url.includes(geminiProductUrl) || geminiProductUrl.includes(p.url))
              : undefined;
            if (!matchedProduct) {
              // Match by price mentioned in response
              const responseText = fullText.replace(/\[source:[^\]]*\]/gi, "").toLowerCase();
              const priceMatches = responseText.match(/€\s?[\d,.]+/g);
              if (priceMatches) {
                for (const p of products) {
                  for (const pm of priceMatches) {
                    const priceNum = parseFloat(pm.replace("€", "").replace(/\s/g, "").replace(",", "."));
                    if (priceNum === p.minPrice || priceNum === p.maxPrice ||
                        p.variants.some(v => v.price === priceNum)) {
                      matchedProduct = p;
                      break;
                    }
                  }
                  if (matchedProduct) break;
                }
              }
            }
            if (!matchedProduct) {
              // Word-match against product titles and tags
              const responseText = fullText.replace(/\[source:[^\]]*\]/gi, "").toLowerCase();
              let bestScore = 0;
              for (const p of products) {
                const matchWords = [...p.title.toLowerCase().split(/\s+/), ...p.tags.map(t => t.toLowerCase())].filter(w => w.length > 3);
                let score = 0;
                for (const w of matchWords) { if (responseText.includes(w)) score++; }
                if (score > bestScore) { bestScore = score; matchedProduct = p; }
              }
            }
            if (matchedProduct) {
              sourceUrl = matchedProduct.url;
              sourceTitle = matchedProduct.title;
              processedSource = `[source: Products | ${sourceUrl} | ${sourceTitle}]`;
            }
          }

          // Post-process: ensure [source: FAQ] tags include the FAQ URL when available
          const faqSourceMatch = fullText.match(/\[source:\s*FAQ\s*(?:\|\s*([^\]]*))?\]/i);
          if (!processedSource && faqSourceMatch && faqs.length > 0) {
            const faqLabel = faqSourceMatch[1]?.trim() || "";
            // Try to find the matching FAQ by question
            let matchedFaq = faqs.find((f) => f.question === faqLabel || f.questionNl === faqLabel || f.questionDe === faqLabel);
            if (!matchedFaq && faqLabel) {
              // Fuzzy match: find FAQ whose question is most similar
              const labelLower = faqLabel.toLowerCase();
              matchedFaq = faqs.find((f) =>
                f.question.toLowerCase().includes(labelLower) || labelLower.includes(f.question.toLowerCase()) ||
                f.questionNl.toLowerCase().includes(labelLower) || labelLower.includes(f.questionNl.toLowerCase())
              );
            }
            if (!matchedFaq) {
              // Last resort: find any FAQ with a URL that seems related by content
              const responseWords = fullText.replace(/\[source:[^\]]*\]/gi, "").toLowerCase().split(/\s+/).filter(w => w.length > 4);
              let bestFaq = null;
              let bestScore = 0;
              for (const f of faqs) {
                if (!f.url) continue;
                const faqWords = new Set([...f.answer.toLowerCase().split(/\s+/), ...f.question.toLowerCase().split(/\s+/)].filter(w => w.length > 4));
                let score = 0;
                for (const w of responseWords) { if (faqWords.has(w)) score++; }
                if (score > bestScore) { bestScore = score; bestFaq = f; }
              }
              if (bestFaq && bestScore > 3) matchedFaq = bestFaq;
            }
            if (matchedFaq?.url) {
              sourceUrl = matchedFaq.url;
              sourceTitle = faqLabel || matchedFaq.question;
              processedSource = `[source: FAQ | ${matchedFaq.url} | ${sourceTitle}]`;
            }
          }

          // Final check: if the response matches a FAQ with a URL, prefer that over Website source
          if (faqs.length > 0) {
            const cleanText = fullText.replace(/\[source:[^\]]*\]/gi, "").toLowerCase();
            const cleanWords = cleanText.split(/\s+/).filter(w => w.length > 4);
            let bestFaqMatch = null;
            let bestFaqScore = 0;
            for (const f of faqs) {
              if (!f.url) continue;
              const answerWords = new Set(
                [f.answer, f.answerNl, f.answerDe].join(" ").toLowerCase().split(/\s+/).filter(w => w.length > 4)
              );
              let score = 0;
              for (const w of cleanWords) { if (answerWords.has(w)) score++; }
              // Normalize by answer length to prefer specific matches
              const normalized = answerWords.size > 0 ? score / Math.sqrt(answerWords.size) : 0;
              if (normalized > bestFaqScore) { bestFaqScore = normalized; bestFaqMatch = f; }
            }
            // If strong FAQ match with URL, override any Website source
            if (bestFaqMatch && bestFaqScore > 2) {
              sourceUrl = bestFaqMatch.url;
              sourceTitle = bestFaqMatch.question;
              processedSource = `[source: FAQ | ${bestFaqMatch.url} | ${bestFaqMatch.question}]`;
            }
          }

          // Resolve language detection and translations
          const detectedLang = await langPromise;
          const langChanged = detectedLang !== (clientLang || "en");
          const done: Record<string, unknown> = { type: "done" };

          // Sanitize: strip newlines and pipe characters from title to prevent source tag parsing issues
          if (sourceTitle) sourceTitle = sourceTitle.replace(/[\n\r|]/g, " ").replace(/\s+/g, " ").trim();
          if (sourceTitle && sourceUrl) {
            processedSource = processedSource?.replace(/\|[^|]*\]$/, `| ${sourceTitle}]`) || null;
          }

          if (processedSource) {
            done.source = processedSource;
            if (sourceTitle) done.sourceTitle = sourceTitle;
            if (sourceUrl) done.sourceUrl = sourceUrl;
          }

          if (langChanged) {
            try {
              const translations = detectedLang === "en"
                ? null
                : await withTimeout(getTranslations(detectedLang), 8000, null);
              done.lang = detectedLang;
              if (translations) {
                done.translations = translations;
              }
            } catch {
              // Non-fatal
            }
          }

          controller.enqueue(encoder.encode(JSON.stringify(done) + "\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: "Stream interrupted" }) + "\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate response: ${message}` },
      { status: 500 }
    );
  }
}
