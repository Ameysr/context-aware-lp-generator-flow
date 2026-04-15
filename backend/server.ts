import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import crypto from "crypto";
import {
  runPersonalizationGraph,
  type StepEmitter,
} from "./graph/personalizationGraph";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ---------- Middleware ----------
app.use(cors({
  origin: true, // reflect request origin (works with credentials unlike "*")
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: "Too many requests. Try again in a minute." },
});
app.use("/api/", limiter);

// ---------- Request logger middleware ----------
app.use((req: Request, _res: Response, next) => {
  if (req.path.startsWith("/api/")) {
    const body = req.body ? { ...req.body } : {};
    // Don't log base64 images — too noisy
    if (body.adImageBase64) body.adImageBase64 = `[BASE64 ${(body.adImageBase64.length * 0.75 / 1024).toFixed(0)}KB]`;
    console.log(`\n[SERVER] → ${req.method} ${req.path}`);
    if (Object.keys(body).length > 0) {
      console.log(`[SERVER]   Body: ${JSON.stringify(body).substring(0, 300)}`);
    }
  }
  next();
});

// ---------- SSE session store ----------
interface SSESession {
  res: Response;
  createdAt: number;
}

const sseSessions = new Map<string, SSESession>();

// ---------- Preview HTML store ----------
const previewStore = new Map<string, { html: string; createdAt: number }>();

// ---------- Session store — original HTML + selectors for refine ----------
interface SessionData {
  originalHTML: string;
  elementSelectors: { headline: string; subheadline: string; ctaButtons: string[]; valueProps: string[] };
  baseUrl: string;
  createdAt: number;
}
const sessionStore = new Map<string, SessionData>();

// Clean up stale sessions and previews every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sseSessions.entries()) {
    if (now - session.createdAt > 5 * 60 * 1000) {
      sseSessions.delete(id);
    }
  }
  for (const [id, preview] of previewStore.entries()) {
    if (now - preview.createdAt > 30 * 60 * 1000) { // 30 min TTL
      previewStore.delete(id);
    }
  }
  for (const [id, sess] of sessionStore.entries()) {
    if (now - sess.createdAt > 30 * 60 * 1000) {
      sessionStore.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ---------- Routes ----------

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    groqAvailable: !!process.env.GROQ_API_KEY,
    deepseekAvailable: !!process.env.DEEPSEEK_API_KEY,
    geminiAvailable: !!process.env.GEMINI_API_KEY,
  });
});

// SSE stream endpoint
app.get("/api/personalize/stream", (req: Request, res: Response) => {
  const sessionId = (req.query.sessionId as string) || crypto.randomUUID();

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write(`data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`);

  sseSessions.set(sessionId, { res, createdAt: Date.now() });
  console.log(`[SSE] Client connected — session: ${sessionId}`);

  req.on("close", () => {
    sseSessions.delete(sessionId);
    console.log(`[SSE] Client disconnected — session: ${sessionId}`);
  });
});

// Preview endpoint — serves the modified HTML in an iframe
app.get("/api/preview/:id", (req: Request, res: Response) => {
  const previewId = req.params.id as string;
  const preview = previewStore.get(previewId);

  if (!preview) {
    res.status(404).send("<h1>Preview not found or expired</h1>");
    return;
  }

  // Strip CSP headers, X-Frame-Options, and frame-busting scripts
  // so the scraped HTML renders correctly inside our iframe
  let html = preview.html;

  // Remove <meta http-equiv="Content-Security-Policy" ...> tags
  html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');
  html = html.replace(/<meta[^>]*http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');

  // Remove inline frame-busting JS patterns
  html = html.replace(/if\s*\(\s*(?:self|window|top)\s*[!=]=+\s*(?:top|window|self|parent)/gi, 'if (false');
  html = html.replace(/top\.location(?:\.href)?\s*=\s*(?:self|window)\.location(?:\.href)?/gi, '// blocked');

  res.set({
    "Content-Type": "text/html",
    "Cache-Control": "no-cache",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  });
  res.send(html);
});

// Apply CRO fixes endpoint
import { applyCROFixes } from "./utils/croApplicator";

app.post("/api/apply-cro", (req: Request, res: Response) => {
  const { previewId, croAnalysis, brandColors } = req.body;

  console.log(`\n[SERVER] Apply CRO fixes — previewId: ${previewId}`);

  if (!previewId || !croAnalysis) {
    res.status(400).json({ error: "Missing previewId or croAnalysis" });
    return;
  }

  const preview = previewStore.get(previewId);
  if (!preview) {
    res.status(404).json({ error: "Preview not found or expired" });
    return;
  }

  try {
    const enhancedHTML = applyCROFixes(preview.html, croAnalysis, brandColors);

    // Store the enhanced version with a new ID
    const newPreviewId = crypto.randomUUID().substring(0, 12);
    previewStore.set(newPreviewId, {
      html: enhancedHTML,
      createdAt: Date.now(),
    });

    console.log(`[SERVER] CRO-enhanced preview: /api/preview/${newPreviewId}`);

    res.json({
      success: true,
      previewId: newPreviewId,
    });
  } catch (e: any) {
    console.error(`[SERVER] CRO apply failed: ${e.message}`);
    res.status(500).json({ error: "Failed to apply CRO fixes" });
  }
});

// ---------- Refine copy endpoint ----------
import { runRefineChain } from "./chains/refineChain";
import { injectPersonalizedCopy } from "./utils/htmlInjector";

app.post("/api/refine", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const { currentCopy, instruction, adProfile, pageProfile, previewId } = req.body;

  console.log(`\n[SERVER] Refine request — instruction: "${instruction}"`);

  if (!currentCopy || !instruction || !adProfile || !pageProfile || !previewId) {
    res.status(400).json({ error: "Missing required fields: currentCopy, instruction, adProfile, pageProfile, previewId" });
    return;
  }

  // Look up session data (original HTML + selectors stored at analysis time)
  const session = sessionStore.get(previewId);
  if (!session) {
    res.status(404).json({ error: "Session not found or expired. Please run a new analysis first." });
    return;
  }

  console.log(`[SERVER] Session found — headline selector: "${session.elementSelectors.headline.substring(0, 80)}"`);

  try {
    // 1. Generate refined copy + text replacements from instruction
    const refineResult = await runRefineChain({ currentCopy, instruction, adProfile, pageProfile });
    const { copy: refinedCopy, textReplacements } = refineResult;

    // 2. Always inject structured fields into the ORIGINAL clean HTML
    let refinedHTML = session.originalHTML;
    try {
      refinedHTML = injectPersonalizedCopy(
        session.originalHTML,
        refinedCopy,
        session.elementSelectors,
        session.baseUrl
      );
    } catch (injectErr: any) {
      console.warn(`[SERVER] Refine HTML injection failed: ${injectErr.message} — serving original HTML with copy only`);
    }

    // 3. Apply global text replacements (brand name changes, nav text, etc.)
    if (textReplacements.length > 0) {
      const cheerio = await import("cheerio");
      const $ = cheerio.load(refinedHTML);

      for (const { find, replace } of textReplacements) {
        if (!find || find.length < 2) continue; // Safety: don't replace 1-char strings

        // Walk all text nodes and replace occurrences
        const walkAndReplace = (node: any) => {
          if (node.type === "text" && node.data) {
            if (node.data.includes(find)) {
              node.data = node.data.split(find).join(replace);
            }
          }
          if (node.children) {
            for (const child of node.children) {
              walkAndReplace(child);
            }
          }
        };

        // Also replace in alt and title attributes
        $(`[alt*="${find}"], [title*="${find}"]`).each((_i: number, el: any) => {
          const $el = $(el);
          const alt = $el.attr("alt");
          const title = $el.attr("title");
          if (alt) $el.attr("alt", alt.split(find).join(replace));
          if (title) $el.attr("title", title.split(find).join(replace));
        });

        walkAndReplace($.root()[0]);
        console.log(`[SERVER] Text replacement: "${find}" → "${replace}"`);
      }

      refinedHTML = $.html();
    }

    // 4. Store refined preview
    const newPreviewId = crypto.randomUUID().substring(0, 12);
    previewStore.set(newPreviewId, { html: refinedHTML, createdAt: Date.now() });

    const elapsed = Date.now() - startTime;
    console.log(`[SERVER] Refine complete in ${elapsed}ms — new preview: /api/preview/${newPreviewId}`);

    res.json({ success: true, refinedCopy, previewId: newPreviewId });
  } catch (e: any) {
    console.error(`[SERVER] Refine failed: ${e.message}`);
    res.status(500).json({ error: e.message || "Refinement failed" });
  }
});

// Main personalization endpoint
app.post("/api/personalize", async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID().substring(0, 8);

  console.log(`\n${"*".repeat(70)}`);
  console.log(`[SERVER] New personalization request [${requestId}]`);
  console.log(`${"*".repeat(70)}`);

  try {
    const { pageUrl, adImageBase64, adText, adUrl, mimeType, sessionId } =
      req.body;

    // --- Input validation ---
    console.log(`[SERVER] [${requestId}] Validating inputs...`);
    console.log(`[SERVER] [${requestId}]   pageUrl: ${pageUrl || "MISSING"}`);
    console.log(`[SERVER] [${requestId}]   adImageBase64: ${adImageBase64 ? `${(adImageBase64.length * 0.75 / 1024).toFixed(0)}KB` : "none"}`);
    console.log(`[SERVER] [${requestId}]   adText: ${adText ? `"${adText.substring(0, 80)}..."` : "none"}`);
    console.log(`[SERVER] [${requestId}]   adUrl: ${adUrl || "none"}`);
    console.log(`[SERVER] [${requestId}]   sessionId: ${sessionId || "none"}`);

    if (!pageUrl) {
      console.log(`[SERVER] [${requestId}] Rejected: missing pageUrl`);
      res.status(400).json({ success: false, error: "pageUrl is required." });
      return;
    }

    try {
      new URL(pageUrl);
    } catch {
      console.log(`[SERVER] [${requestId}] Rejected: invalid pageUrl`);
      res.status(400).json({ success: false, error: "pageUrl is not a valid URL." });
      return;
    }

    if (!adImageBase64 && !adText && !adUrl) {
      console.log(`[SERVER] [${requestId}] Rejected: no ad input`);
      res.status(400).json({
        success: false,
        error: "At least one of adImageBase64, adText, or adUrl must be provided.",
      });
      return;
    }

    if (adImageBase64 && !mimeType) {
      console.log(`[SERVER] [${requestId}] Rejected: image without mimeType`);
      res.status(400).json({
        success: false,
        error: "mimeType is required when adImageBase64 is provided.",
      });
      return;
    }

    console.log(`[SERVER] [${requestId}] Inputs valid — starting pipeline...`);

    // --- SSE emitter ---
    const sseSession = sessionId ? sseSessions.get(sessionId) : null;
    if (sseSession) {
      console.log(`[SERVER] [${requestId}] SSE session found — will stream step updates`);
    } else {
      console.log(`[SERVER] [${requestId}] No SSE session — REST-only response`);
    }

    const emitStep: StepEmitter = (step, label, status) => {
      console.log(`[SSE] [${requestId}] Step ${step}: "${label}" → ${status}`);
      if (sseSession) {
        const event = JSON.stringify({ type: "step", step, label, status });
        sseSession.res.write(`data: ${event}\n\n`);
      }
    };

    // --- Run the pipeline ---
    const graphResult = await runPersonalizationGraph(
      {
        adInput: {
          imageBase64: adImageBase64,
          mimeType,
          adText,
          adUrl,
        },
        pageUrl,
      },
      emitStep
    );

    const processingTime = Date.now() - startTime;

    // Build response
    const output = graphResult.finalOutput;

    if (output.success) {
      // Store modified HTML for preview endpoint
      let previewId = "";
      let originalPreviewId = "";

      if (output.modifiedHTML) {
        previewId = crypto.randomUUID().substring(0, 12);
        previewStore.set(previewId, {
          html: output.modifiedHTML,
          createdAt: Date.now(),
        });
        console.log(`[SERVER] [${requestId}] Modified preview: /api/preview/${previewId}`);
      }

      if (output.originalHTML) {
        originalPreviewId = crypto.randomUUID().substring(0, 12);
        previewStore.set(originalPreviewId, {
          html: output.originalHTML,
          createdAt: Date.now(),
        });
        console.log(`[SERVER] [${requestId}] Original preview: /api/preview/${originalPreviewId}`);

        // Store session data for refine endpoint — always inject from clean original
        if (previewId) {
          sessionStore.set(previewId, {
            originalHTML: output.originalHTML,
            elementSelectors: output.elementSelectors || { headline: "", subheadline: "", ctaButtons: [], valueProps: [] },
            baseUrl: output.baseUrl || "",
            createdAt: Date.now(),
          });
          console.log(`[SERVER] [${requestId}] Session stored for refine — headline selector: "${(output.elementSelectors?.headline || "").substring(0, 60)}"`);
        }
      }

      const response = {
        success: true,
        warning: output.warning,
        adProfile: output.adProfile,
        pageProfile: output.pageProfile,
        personalizedCopy: output.personalizedCopy,
        validationScore: output.validationScore,
        validationReason: output.validationReason,
        llmUsed: output.llmUsed,
        visionUsed: output.visionUsed,
        processingTime,
        previewId: previewId || undefined,
        originalPreviewId: originalPreviewId || undefined,
        screenshotBase64: output.screenshotBase64,
        brandColors: output.brandColors,
        faviconUrl: output.faviconUrl,
        croAnalysis: output.croAnalysis || null,
        messageMatchScore: output.messageMatchScore || null,
        // Required for refine re-injection
        elementSelectors: output.elementSelectors || null,
        baseUrl: output.baseUrl || "",
      };

      console.log(`\n[SERVER] [${requestId}] SUCCESS — ${processingTime}ms`);
      console.log(`[SERVER] [${requestId}]    Modified: ${previewId ? `/api/preview/${previewId}` : "none"}`);
      console.log(`[SERVER] [${requestId}]    Original: ${originalPreviewId ? `/api/preview/${originalPreviewId}` : "none"}`);

      if (sseSession) {
        sseSession.res.write(
          `data: ${JSON.stringify({ type: "result", data: response })}\n\n`
        );
      }

      res.json(response);
      return;
    } else {
      console.log(`\n[SERVER] [${requestId}] FAILED — stage: ${output.stage}, error: ${output.error}`);

      if (sseSession) {
        sseSession.res.write(
          `data: ${JSON.stringify({ type: "error", error: output.error, stage: output.stage })}\n\n`
        );
      }

      res.status(500).json({
        success: false,
        error: output.error,
        stage: output.stage,
      });
      return;
    }
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`\n[SERVER] [${requestId}] UNHANDLED ERROR after ${elapsed}ms`);
    console.error(`[SERVER] [${requestId}]   ${error.message}`);
    console.error(`[SERVER] [${requestId}]   Stack: ${error.stack?.split("\n").slice(0, 3).join(" → ")}`);
    res.status(500).json({
      success: false,
      error: error.message || "Internal server error",
      stage: "unknown",
    });
    return;
  }
});

// ---------- Start server ----------
app.listen(PORT, () => {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`  AdSync Server — http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  console.log(`  Groq: ${!!process.env.GROQ_API_KEY} | DeepSeek: ${!!process.env.DEEPSEEK_API_KEY} | Gemini: ${!!process.env.GEMINI_API_KEY}`);
  console.log(`${"═".repeat(50)}\n`);
});

export default app;
