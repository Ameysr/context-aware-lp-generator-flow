import axios from "axios";
import { analyzeAdImage } from "../utils/visionHandler";
import { invokeLLMWithRetry } from "../utils/retryHandler";
import { adProfileSchema, type AdProfile } from "../schemas/adProfileSchema";

interface AdAnalysisInput {
  imageBase64?: string;
  mimeType?: string;
  adText?: string;
  adUrl?: string;
}

/**
 * Ad Analysis Chain:
 * CASE 1: Image → Gemini Vision → text description → Groq structured extraction
 * CASE 2: URL → fetch meta tags → Groq structured extraction
 * CASE 3: Text → Groq structured extraction directly
 */
export async function runAdAnalysisChain(
  input: AdAnalysisInput
): Promise<AdProfile> {
  console.log("\n" + "=".repeat(60));
  console.log("[AD CHAIN] Starting ad analysis...");
  console.log("[AD CHAIN] Input keys:", Object.keys(input).filter((k) => !!(input as any)[k]).join(", "));
  const startTime = Date.now();

  let adContent: string;

  // CASE 1 — Image present: use Gemini Vision first
  if (input.imageBase64 && input.mimeType) {
    console.log("[AD CHAIN] CASE 1: Image detected → Gemini Vision → Groq extraction");
    console.log(`[AD CHAIN]    Image size: ${(input.imageBase64.length * 0.75 / 1024).toFixed(1)} KB, type: ${input.mimeType}`);
    adContent = await analyzeAdImage({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
    });
    console.log(`[AD CHAIN]    Gemini returned ${adContent.length} chars of description`);
  }
  // CASE 2 — URL present (no image): scrape meta tags
  else if (input.adUrl) {
    console.log(`[AD CHAIN] CASE 2: URL detected → Meta extraction → Groq extraction`);
    console.log(`[AD CHAIN]    URL: ${input.adUrl}`);
    try {
      const response = await axios.get(input.adUrl, {
        timeout: 10000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      const html: string = response.data;
      console.log(`[AD CHAIN]    Fetched HTML: ${html.length} chars`);

      // Extract meta tags from raw HTML
      const ogTitle =
        html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)?.[1] || "";
      const ogDesc =
        html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)?.[1] || "";
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || "";
      const h1 = html.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1] || "";
      const metaDesc =
        html.match(/<meta\s+name="description"\s+content="([^"]*)"/i)?.[1] || "";

      console.log(`[AD CHAIN]    Extracted: ogTitle="${ogTitle.substring(0, 50)}", title="${title.substring(0, 50)}"`);

      adContent = [
        ogTitle && `OG Title: ${ogTitle}`,
        ogDesc && `OG Description: ${ogDesc}`,
        title && `Page Title: ${title}`,
        h1 && `Headline: ${h1}`,
        metaDesc && `Meta Description: ${metaDesc}`,
      ]
        .filter(Boolean)
        .join("\n");

      if (!adContent.trim()) {
        throw new Error("No content extracted from URL");
      }
    } catch (error: any) {
      console.error(`[AD CHAIN] URL fetch failed: ${error.message}`);
      throw new Error(
        `Failed to fetch ad URL: ${error.message}. Try pasting the ad text directly.`
      );
    }
  }
  // CASE 3 — Direct text
  else if (input.adText) {
    console.log(`[AD CHAIN] CASE 3: Direct text (${input.adText.length} chars)`);
    console.log(`[AD CHAIN]    Preview: "${input.adText.substring(0, 100)}..."`);
    adContent = input.adText;
  } else {
    console.error("[AD CHAIN] No ad input provided!");
    throw new Error(
      "No ad input provided. Supply imageBase64, adUrl, or adText."
    );
  }

  // Groq structured extraction
  console.log(`[AD CHAIN] Sending ${adContent.length} chars to LLM for structured extraction...`);

  const prompt = `You are an expert ad analyst. Analyze the following ad content and extract structured information.

Ad Content:
${adContent}

Respond ONLY with a valid JSON object. No explanation, no preamble, no markdown code blocks. Just the raw JSON:
{
  "offer": "the main offer or product being advertised (max 100 chars)",
  "headline": "the main headline or hook (max 80 chars)",
  "tone": "one of exactly: professional, casual, urgent, playful, authoritative",
  "audience": "who this ad is targeting (max 100 chars)",
  "urgency_level": "one of exactly: low, medium, high",
  "cta_text": "the call to action text (max 50 chars)",
  "visual_theme": "describe the visual style briefly (max 100 chars)",
  "key_benefit": "the single most important benefit promised (max 150 chars)"
}

Critical rules:
- tone MUST be one of: professional, casual, urgent, playful, authoritative
- urgency_level MUST be one of: low, medium, high
- Never return null for any field, use empty string "" if unknown
- No markdown, no backticks, raw JSON only`;

  const parsed = await invokeLLMWithRetry(prompt);

  try {
    const validated = adProfileSchema.parse(parsed);
    const elapsed = Date.now() - startTime;
    console.log(`[AD CHAIN] Ad profile validated in ${elapsed}ms`);
    console.log(`[AD CHAIN]    offer="${validated.offer}"`);
    console.log(`[AD CHAIN]    tone=${validated.tone}, urgency=${validated.urgency_level}`);
    console.log("=".repeat(60) + "\n");
    return validated;
  } catch (zodError: any) {
    console.error("[AD CHAIN] Zod validation failed!");
    console.error("[AD CHAIN]    Parsed data:", JSON.stringify(parsed));
    console.error("[AD CHAIN]    Errors:", JSON.stringify(zodError.errors || zodError.issues));
    throw new Error(
      `Ad profile validation failed: ${JSON.stringify(zodError.errors || zodError.issues)}`
    );
  }
}
