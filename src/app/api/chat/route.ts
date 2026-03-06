import { GoogleGenerativeAI, type Content } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";
import { getRelevantDocuments, getBinaryDocumentContext } from "@/lib/documents";
import { getConfig } from "@/lib/config";
import { getFaqs, buildFaqContext } from "@/lib/faq";
import { getWebsiteContent, buildWebsiteContext } from "@/lib/website";
import { isVectorConfigured, queryWebsite, queryFaqs, type WebsiteMatch, type FaqMatch } from "@/lib/vector";
import { getProducts, buildProductsContext } from "@/lib/shopify";
import { getTranslations } from "@/lib/i18n/translate";
import { getSession, fetchCustomerOrders, buildOrdersContext, type ShopifyOrder } from "@/lib/shopify-auth";
import { getUserData } from "@/lib/airtable";
import { getFoldersForRoles, getCapabilitiesForRoles } from "@/lib/role-access";
import { getUserDocuments, buildDocumentValidityContext, getInstructorBookings, buildScheduleContext } from "@/lib/wings";
import { chatRequestSchema } from "@/lib/api-schemas";
import { logger, apiTimer } from "@/lib/logger";
import { checkRateLimit } from "@/lib/kv-cache";

export const maxDuration = 60;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/**
 * Simple heuristic language detection based on common function words.
 * Used as fallback when Gemini doesn't include a [lang: xx] tag.
 */
function detectLanguageHeuristic(text: string): string {
  const clean = text.replace(/\[.*?\]/g, "").toLowerCase();
  const words = clean.split(/\s+/);

  const nlWords = new Set(["het", "een", "van", "voor", "niet", "ook", "maar", "wel", "nog", "bij", "wordt", "deze", "hebben", "meer", "kunnen", "heeft", "naar", "zijn", "daar", "hier", "waar", "onze", "jouw"]);
  const deWords = new Set(["der", "das", "ein", "eine", "und", "ist", "auf", "nicht", "auch", "sich", "den", "dem", "des", "werden", "kann", "oder", "nach", "über", "sind", "haben", "wird", "hier", "ihre"]);
  const enWords = new Set(["the", "and", "for", "are", "but", "not", "you", "all", "can", "was", "our", "has", "have", "will", "been", "from", "with", "this", "that", "they", "your", "about", "would", "which"]);

  let nl = 0, de = 0, en = 0;
  for (const w of words) {
    if (nlWords.has(w)) nl++;
    if (deWords.has(w)) de++;
    if (enWords.has(w)) en++;
  }

  if (nl > en && nl > de) return "nl";
  if (de > en && de > nl) return "de";
  if (en > nl && en > de) return "en";
  return "en"; // default
}

function emitProgress(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  step: string,
) {
  controller.enqueue(encoder.encode(JSON.stringify({ type: "progress", step }) + "\n"));
}

function trackProgress<T>(
  promise: Promise<T>,
  step: string,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
): Promise<T> {
  return promise.then((result) => {
    emitProgress(controller, encoder, step);
    return result;
  });
}

export async function POST(request: NextRequest) {
  const logDone = apiTimer("POST /api/chat");
  try {
    const parsed = chatRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { messages, lang: clientLang, flowContext, roleOverride, userEmail: userEmailOverride } = parsed.data;

    // Rate limiting by IP
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const { allowed, remaining } = await checkRateLimit(ip);
    if (!allowed) {
      logger.warn("Rate limited", { ip });
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
      );
    }

    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Get user roles, capabilities, and access token
    let userRoles: string[] = [];
    let capabilities: string[] = [];
    let wingsUserId: number | null = null;
    let accessToken: string | null = null;

    // Check if current user is allowed to use debug overrides
    const DEBUG_OVERRIDE_EMAILS = ["matthijs@eflight.nl", "matthijscollard@gmail.com"];
    let sessionForOverrideCheck: { customer?: { email?: string }; accessToken: string } | null = null;
    const wantsOverride = roleOverride?.length || userEmailOverride;
    if (wantsOverride) {
      try {
        sessionForOverrideCheck = await getSession();
      } catch { /* no session */ }
    }
    const isDebugAllowed = process.env.NODE_ENV !== "production"
      ? true
      : sessionForOverrideCheck?.customer?.email
        ? DEBUG_OVERRIDE_EMAILS.includes(sessionForOverrideCheck.customer.email.toLowerCase())
        : false;

    // User/role override (dev or authorized admin)
    if (isDebugAllowed && wantsOverride) {
      if (userEmailOverride) {
        const userData = await getUserData(userEmailOverride);
        wingsUserId = userData.wingsUserId;
        // If role override is also set, use that instead of Airtable roles
        userRoles = roleOverride?.length ? roleOverride : userData.roles;
      } else {
        userRoles = roleOverride!;
        wingsUserId = 1062; // Dev mock fallback
      }
      capabilities = await getCapabilitiesForRoles(userRoles);
      console.log(`[DEV] Chat override: email=${userEmailOverride || "dev@eflight.nl"}, roles=[${userRoles.join(", ")}], caps=[${capabilities.join(", ")}], wingsUserId=${wingsUserId}`);
    } else {
      try {
        const session = sessionForOverrideCheck ?? await getSession();
        if (session?.customer?.email) {
          const userData = await getUserData(session.customer.email);
          userRoles = userData.roles;
          wingsUserId = userData.wingsUserId;
          capabilities = await getCapabilitiesForRoles(userRoles);
          accessToken = session.accessToken;
        }
      } catch (err) {
        console.warn("Failed to get user roles:", err);
      }
    }

    // Get allowed folders based on roles (defaults to ["public"] for anonymous)
    const allowedFolders = await getFoldersForRoles(userRoles);
    console.log(`Chat: user roles [${userRoles.join(", ")}] → folders [${allowedFolders.join(", ")}], caps: [${capabilities.join(", ")}]`);

    const lastMessage = messages[messages.length - 1];
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {

    // Load config first (needed for website_pages URLs)
    const config = await trackProgress(withTimeout(
      getConfig().catch((err) => { console.error("Failed to load config:", err); return null; }),
      5000, null
    ), "config", controller, encoder);

    // Use RAG for website/FAQ when vector store is configured
    const useVectorRag = isVectorConfigured();

    // Load remaining data sources in parallel (with progress events)
    const [faqs, ragResult, binaryContext, websitePages, products, orders, wingsDocResult, wingsScheduleResult, faqMatches, websiteMatches] = await Promise.all([
      // Full FAQ list (needed for source matching even with RAG)
      trackProgress(withTimeout(
        getFaqs(true).catch((err) => { console.error("Failed to load FAQs:", err); return [] as never[]; }),
        5000, []
      ), "faqs", controller, encoder),
      trackProgress(withTimeout(
        getRelevantDocuments(lastMessage.content, allowedFolders).catch((err) => { console.error("Failed to load RAG context:", err); return null; }),
        10000, null
      ), "documents", controller, encoder),
      trackProgress(withTimeout(
        getBinaryDocumentContext(allowedFolders).catch((err) => { console.error("Failed to load binary context:", err); return null; }),
        10000, null
      ), "files", controller, encoder),
      // Full website pages (fallback when no vector, also needed for source URL matching)
      trackProgress(withTimeout(
        getWebsiteContent(config?.website_pages, true).catch((err) => {
          console.error("Failed to load website content:", err);
          return [] as never[];
        }),
        10000, []
      ), "website", controller, encoder),
      trackProgress(withTimeout(
        getProducts().catch((err) => {
          console.error("Failed to load products:", err);
          return [] as never[];
        }),
        5000, []
      ), "products", controller, encoder),
      accessToken
        ? trackProgress(withTimeout(
            fetchCustomerOrders(accessToken).catch((err) => {
              console.error("Failed to fetch orders:", err);
              return [] as ShopifyOrder[];
            }),
            5000, [] as ShopifyOrder[]
          ), "orders", controller, encoder)
        : Promise.resolve([] as ShopifyOrder[]),
      capabilities.includes("doc-validity") && wingsUserId
        ? trackProgress(withTimeout(
            getUserDocuments(wingsUserId).catch((err) => {
              console.error("Failed to fetch Wings documents:", err);
              return null;
            }),
            8000, null
          ), "doc-validity", controller, encoder)
        : Promise.resolve(null),
      capabilities.includes("instructor-schedule") && wingsUserId
        ? trackProgress(withTimeout(
            getInstructorBookings(wingsUserId).catch((err) => {
              console.error("Failed to fetch instructor schedule:", err);
              return null;
            }),
            8000, null
          ), "instructor-schedule", controller, encoder)
        : Promise.resolve(null),
      // RAG queries for FAQ and website
      useVectorRag
        ? trackProgress(withTimeout(
            queryFaqs(lastMessage.content, 8).catch((err) => { console.error("FAQ RAG failed:", err); return [] as FaqMatch[]; }),
            5000, [] as FaqMatch[]
          ), "faq-rag", controller, encoder)
        : Promise.resolve([] as FaqMatch[]),
      useVectorRag
        ? trackProgress(withTimeout(
            queryWebsite(lastMessage.content, 10).catch((err) => { console.error("Website RAG failed:", err); return [] as WebsiteMatch[]; }),
            5000, [] as WebsiteMatch[]
          ), "website-rag", controller, encoder)
        : Promise.resolve([] as WebsiteMatch[]),
    ]);

    const searchOrder = config?.search_order ?? ["faq", "drive"];
    const toneOfVoice = config?.tone_of_voice ?? "professional, friendly, and helpful";
    const companyContext = config?.company_context ?? "E-Flight Academy is a flight training academy.";
    const fallbackInstruction = config?.fallback_instruction ?? "If the answer cannot be found in any of the provided sources, you may use your general knowledge to answer, but clearly state that the information does not come from E-Flight Academy's official documents or FAQs.";
    const systemInstructions = (config as Record<string, unknown>)?.system_instructions as string | undefined;

    const genAI = new GoogleGenerativeAI(geminiApiKey);

    // Build system instruction based on search_order
    const instructionParts: string[] = [];

    instructionParts.push(
      `You are the Steward assistant. ${companyContext}`,
      `Today's date is: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
      `Your tone of voice is: ${toneOfVoice}.`,
      "STRICT RULE: ONLY use information that is explicitly present in the context sections below (FAQ, Knowledge Base, Website Content, Products, Orders). NEVER invent, guess, or fill in details that are not in the provided data. If the context does not contain enough information to fully answer a question, say so honestly and suggest the user contact E-Flight directly. Do not fabricate dates, events, prices, names, or any other facts.",
      "Give thorough, helpful answers using the provided context. Include relevant details like dates, times, prices, and descriptions when available in the sources. Do NOT just refer users to a page — actually include the information from the sources in your response.",
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
      "IMPORTANT: When mentioning URLs, email addresses, or phone numbers, always format them as clickable markdown links. For websites use [visible text](https://example.com). For email addresses always show the full address as link text: [info@eflight.nl](mailto:info@eflight.nl). For phone numbers always show the full number as link text: [055 203 2230](tel:+31552032230). When referring someone to contact E-Flight by phone, ALSO mention WhatsApp as an option and include the link: [WhatsApp](https://wa.me/31552032230). Never hide the address or number behind generic words like 'email' or 'phone'. Never use raw HTML tags. NEVER include URLs that are not provided in the context below (FAQ, Website Content, Products sections). Do not make up or guess URLs — only use URLs that appear in the provided data.",
      "LINK CARDS: When your answer references a relevant page, include one or more [link: url | label] tags at the END of your response (before the [source: ...] tag). These render as clickable card buttons. For the label, use the actual page title as it appears in the Website Content, FAQ, or Products sections — do not shorten or paraphrase it. ONLY use URLs that explicitly appear in the Website Content, FAQ, or Products sections below. NEVER create link cards for Knowledge Base documents — these are internal files without public URLs. Do not make up or guess URLs. IMPORTANT: Never include duplicate link cards for the same page in different languages (e.g. /pages/agenda and /en/pages/agenda are the same page). Always use the URL that matches the language of your response.",
      "FOLLOW-UP SUGGESTIONS: At the very end of your response (after any [link:] tags, before the [source:] tag), include exactly 2 short follow-up questions the user might want to ask next. Format: [suggestions: question 1 | question 2]. The questions must be in the same language as your response, contextually relevant, and concise (max 60 characters each). Do not include suggestions for simple greetings.",
      "MANDATORY: You MUST end EVERY response with a source tag on a new line. Format: [source: X] where X is one of: FAQ, Website, Products, Orders, Knowledge Base, General Knowledge. When the source is Website, include the page URL like this: [source: Website | https://www.eflight.nl/page]. When the source is FAQ, include the original FAQ question (in English) like this: [source: FAQ | What does the training cost?]. When the source is Products (Shop Products & Prices section), include the product URL like this: [source: Products | https://www.eflight.nl/products/product-name]. If the answer comes from a FAQ entry, ALWAYS use FAQ as the source, even if similar information exists on the website. If the answer is about product pricing from the Shop Products section, use Products as the source. This is required for every single response without exception."
    );

    instructionParts.push(
      `MANDATORY: Always respond in the SAME language as the user's message. If the user writes in Dutch, you MUST respond in Dutch. If in German, respond in German. If in English, respond in English. The user's current language preference is: ${clientLang || "en"}. Never say you cannot respond in a language - just respond in whatever language the user uses.`,
      "LANGUAGE TAG: After the [source: ...] tag, add a [lang: xx] tag with the ISO 639-1 code of the language you responded in. For example: [lang: nl] for Dutch, [lang: en] for English, [lang: de] for German. This must be the very last tag in your response."
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

    // Append FAQ context (RAG or full)
    if (searchOrder.includes("faq") && faqs.length > 0) {
      const MIN_FAQ_SCORE = 0.65;
      const relevantFaqMatches = faqMatches.filter((m) => m.score >= MIN_FAQ_SCORE);
      if (useVectorRag && relevantFaqMatches.length > 0) {
        // RAG: only include relevant FAQs matched by vector search
        const matchedQuestions = new Set(relevantFaqMatches.map((m) => m.question));
        const relevantFaqs = faqs.filter((f) => matchedQuestions.has(f.question));
        console.log(`FAQ RAG: ${faqMatches.length} matches, ${relevantFaqs.length} above threshold (${MIN_FAQ_SCORE})`);
        instructionParts.push("", buildFaqContext(relevantFaqs, clientLang || "en"));
      } else {
        // Fallback: send all FAQs
        instructionParts.push("", buildFaqContext(faqs, clientLang || "en"));
      }
    }

    // Append Drive document context (RAG excerpts or full text fallback)
    if (searchOrder.includes("drive") && ragResult?.systemInstructionText) {
      instructionParts.push(
        "",
        "=== Knowledge Base Documents (most relevant excerpts) ===",
        ragResult.systemInstructionText
      );
    }

    // Append Website context (RAG or full)
    if (searchOrder.includes("website") && websitePages.length > 0) {
      const MIN_WEBSITE_SCORE = 0.65;
      const relevantWebMatches = websiteMatches.filter((m) => m.score >= MIN_WEBSITE_SCORE);
      if (useVectorRag && relevantWebMatches.length > 0) {
        // RAG: only include relevant website excerpts
        // Deduplicate by URL and limit per page
        const seen = new Set<string>();
        const deduped: WebsiteMatch[] = [];
        for (const m of relevantWebMatches) {
          const key = m.url;
          if (!seen.has(key) || deduped.filter((d) => d.url === key).length < 3) {
            seen.add(key);
            deduped.push(m);
          }
        }
        console.log(`Website RAG: ${websiteMatches.length} matches, ${deduped.length} above threshold (${MIN_WEBSITE_SCORE})`);
        const entries = deduped
          .map((m) => `--- ${m.title} (${m.url}) ---\n${m.text}`)
          .join("\n\n");
        instructionParts.push("", `=== Website Content (relevant excerpts) ===\n${entries}`);
      } else {
        // Fallback: send all pages
        instructionParts.push("", buildWebsiteContext(websitePages));
      }
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

    // Append Wings document validity context
    if (wingsDocResult?.documents) {
      const docContext = buildDocumentValidityContext(wingsDocResult.documents, wingsDocResult.userName);
      if (docContext) {
        instructionParts.push("", docContext);
        instructionParts.push(
          "When presenting document validity information, highlight expired documents with a clear warning. For documents expiring within 30 days, suggest the user take action soon. Group by status (expired, expiring soon, valid). Be helpful and specific about what steps to take for expired or expiring documents."
        );
      }
    }

    // Append instructor schedule context
    if (wingsScheduleResult?.bookings) {
      const scheduleContext = buildScheduleContext(wingsScheduleResult);
      if (scheduleContext) {
        instructionParts.push("", scheduleContext);
        instructionParts.push(
          "When presenting the instructor's schedule: only show days that have lessons (skip empty days). Format clearly by date with a clickable link to the Wings booking page for that date. Include student names, aircraft, and time slots. Highlight back-to-back lessons. If there are notes/comments on a booking, include relevant details. Use the Wings links provided in the context (format: https://eflight.oywings.com/bookings?date=YYYY-MM-DD)."
        );
      }
    }

    const systemInstruction = instructionParts.join("\n");

    // Log context size breakdown per section
    const sectionSizes: Record<string, number> = {};
    const sysText = systemInstruction;
    // Extract sections by === markers
    const sectionRegex = /=== (.+?) ===/g;
    let lastIdx = 0;
    let match;
    const foundSections: { name: string; start: number }[] = [];
    while ((match = sectionRegex.exec(sysText)) !== null) {
      foundSections.push({ name: match[1], start: match.index });
    }
    if (foundSections.length > 0) {
      // Everything before first section = "Base instructions"
      sectionSizes["Base instructions"] = foundSections[0].start;
      for (let i = 0; i < foundSections.length; i++) {
        const end = i + 1 < foundSections.length ? foundSections[i + 1].start : sysText.length;
        sectionSizes[foundSections[i].name] = end - foundSections[i].start;
      }
    } else {
      sectionSizes["System instruction"] = sysText.length;
    }
    lastIdx = 0; // suppress unused warning
    void lastIdx;

    const historyChars = messages.slice(0, -1).reduce((sum, m) => sum + m.content.length, 0);
    const binaryCount = binaryContext?.fileParts.length ?? 0;
    const totalChars = systemInstruction.length + historyChars + lastMessage.content.length;

    // Emit context sizes as a progress event (visible in network tab / debug)
    const contextSizes = Object.fromEntries(
      Object.entries(sectionSizes)
        .sort((a, b) => b[1] - a[1])
        .map(([name, chars]) => [name, { chars, tokens: Math.round(chars / 4) }])
    );
    contextSizes["Chat history"] = { chars: historyChars, tokens: Math.round(historyChars / 4) };
    controller.enqueue(encoder.encode(JSON.stringify({
      type: "context_sizes",
      sections: contextSizes,
      total: { chars: totalChars, tokens: Math.round(totalChars / 4) },
      binaryFiles: binaryCount,
    }) + "\n"));

    console.log(`[Context] Total: ${totalChars.toLocaleString()} chars (~${Math.round(totalChars / 4).toLocaleString()} tokens, excl. binary)`);

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
      generationConfig: { temperature: 0.2 },
    });

    // Build chat history
    // Only include binary file parts on the first message to avoid re-processing
    // scanned PDFs on every exchange. On follow-up messages, text context suffices.
    const fileContextHistory: Content[] = [];
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
      .map((msg) => ({
        role: msg.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: msg.content }],
      }));

    // Gemini requires the first message to be from "user". Drop leading
    // "model" messages (e.g. guided-flow welcome) — that context is already
    // captured in the system instruction via flowContext.
    const firstUserIdx = allHistory.findIndex((m: { role: string }) => m.role === "user");
    const userHistory = firstUserIdx >= 0 ? allHistory.slice(firstUserIdx) : [];

    const history = [...fileContextHistory, ...userHistory];

    const chat = model.startChat({ history });

    // Start streaming response from Gemini
    emitProgress(controller, encoder, "generating");
    const streamResult = await chat.sendMessageStream(lastMessage.content);

    let fullText = "";

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

          // Removed: aggressive FAQ word-matching override that incorrectly
          // re-attributed Knowledge Base / General Knowledge answers as FAQ

          // Parse language from [lang: xx] tag in response, fall back to heuristic
          const langTagMatch = fullText.match(/\[lang:\s*([a-z]{2})\s*\]/i);
          const detectedLang = langTagMatch
            ? langTagMatch[1].toLowerCase()
            : detectLanguageHeuristic(fullText);
          fullText = fullText.replace(/\n?\[lang:\s*[a-z]{2}\s*\]/i, "").trimEnd();
          const langChanged = detectedLang !== (clientLang || "en");
          const done: Record<string, unknown> = { type: "done" };

          // Localize URLs based on detected language (we only index NL pages)
          if (detectedLang !== "nl") {
            const localizeUrl = (url: string) => {
              try {
                const parsed = new URL(url);
                // Only localize eflight.nl URLs that aren't already localized
                if (parsed.hostname.includes("eflight.nl") &&
                    !parsed.pathname.startsWith(`/${detectedLang}/`)) {
                  parsed.pathname = `/${detectedLang}${parsed.pathname}`;
                  return parsed.toString();
                }
              } catch { /* not a valid URL */ }
              return url;
            };
            // Localize URLs in response text ([link: url | label] tags and markdown links)
            fullText = fullText.replace(/\[link:\s*(https?:\/\/[^\s|]+)/gi, (match, url) =>
              match.replace(url, localizeUrl(url))
            );
            fullText = fullText.replace(/\]\((https?:\/\/[^)]+eflight\.nl[^)]*)\)/gi, (match, url) =>
              match.replace(url, localizeUrl(url))
            );
            if (sourceUrl) sourceUrl = localizeUrl(sourceUrl);
            if (processedSource && sourceUrl) {
              processedSource = processedSource.replace(/(https?:\/\/[^\s|]+eflight\.nl[^\s|]*)/, sourceUrl);
            }
          }

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

          // Parse and strip [suggestions: q1 | q2] tag
          const suggestionsMatch = fullText.match(/\[suggestions:\s*([^\]]+)\]/i);
          if (suggestionsMatch) {
            const suggestions = suggestionsMatch[1].split("|").map((s) => s.trim()).filter(Boolean);
            if (suggestions.length > 0) {
              done.suggestions = suggestions.slice(0, 3);
            }
            fullText = fullText.replace(/\n?\[suggestions:\s*[^\]]+\]/i, "").trimEnd();
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
          logDone({ status: 200 });
        } catch (err) {
          logger.error("Stream error", { error: String(err) });
          controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: "Stream interrupted" }) + "\n"));
          controller.close();
          logDone({ status: 500 });
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
    const detail = error instanceof Error ? { message: error.message, stack: error.stack?.split("\n").slice(0, 5).join("\n") } : String(error);
    logger.error("Chat API error", { error: detail });
    logDone({ status: 500 });
    return NextResponse.json(
      { error: "Something went wrong. Please try again in a moment." },
      { status: 500 }
    );
  }
}
