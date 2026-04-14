import { scrapePage } from "../scrapers/pageScraper";
import type { ElementSelectors } from "../scrapers/pageScraper";
import { invokeLLMWithRetry } from "../utils/retryHandler";
import {
  pageProfileSchema,
  type PageProfile,
} from "../schemas/pageProfileSchema";

export interface PageIngestionResult {
  profile: PageProfile;
  screenshotBase64: string;
  brandColors: { primary: string; background: string; text: string };
  faviconUrl: string;
  // NEW — for same-page injection
  fullHTML: string;
  elementSelectors: ElementSelectors;
  baseUrl: string;
}

/**
 * Page Ingestion Chain:
 * 1. Playwright scrapes the landing page (content + screenshot + brand colors + full HTML)
 * 2. Groq extracts structured page profile from scraped content
 */
export async function runPageIngestionChain(url: string): Promise<PageIngestionResult> {
  console.log("\n" + "=".repeat(60));
  console.log(`[PAGE CHAIN] Starting page ingestion...`);
  console.log(`[PAGE CHAIN]    URL: ${url}`);
  const startTime = Date.now();

  // Step 1: Playwright scrape
  console.log("[PAGE CHAIN] Step 1: Launching Playwright scraper...");
  const scraped = await scrapePage(url);
  const scrapeTime = Date.now() - startTime;
  console.log(`[PAGE CHAIN]    Scrape done in ${scrapeTime}ms`);
  console.log(`[PAGE CHAIN]    Title: "${scraped.title.substring(0, 80)}"`);
  console.log(`[PAGE CHAIN]    H1: "${scraped.h1.substring(0, 80)}"`);
  console.log(`[PAGE CHAIN]    H2: "${scraped.h2.substring(0, 80)}"`);
  console.log(`[PAGE CHAIN]    Buttons: "${scraped.buttons.substring(0, 80)}"`);
  console.log(`[PAGE CHAIN]    RawText: ${scraped.rawText.length} chars total`);
  console.log(`[PAGE CHAIN]    Primary: ${scraped.brandColors.primary}`);
  console.log(`[PAGE CHAIN]    Screenshot: ${(scraped.screenshotBase64.length * 0.75 / 1024).toFixed(0)}KB`);
  console.log(`[PAGE CHAIN]    Full HTML: ${(scraped.fullHTML.length / 1024).toFixed(0)}KB`);
  console.log(`[PAGE CHAIN]    Selectors: headline=${scraped.elementSelectors.headline ? "found" : "not found"}, sub=${scraped.elementSelectors.subheadline ? "found" : "not found"}, cta=${scraped.elementSelectors.ctaButtons.length}, props=${scraped.elementSelectors.valueProps.length}`);

  // Step 2: Groq extraction
  console.log("[PAGE CHAIN] Step 2: Sending to LLM for structured extraction...");

  const prompt = `You are a landing page analyst. Analyze this landing page content.

Page URL: ${url}

Page Content:
${scraped.rawText}

Respond ONLY with a valid JSON object. No explanation, no markdown:
{
  "hero_headline": "the main h1 headline text",
  "subheadline": "the main h2 or subtitle text",
  "value_props": ["benefit one", "benefit two", "benefit three"],
  "cta_text": "primary call to action button text",
  "current_tone": "describe current tone in 2-3 words",
  "page_url": "${url}"
}

Rules:
- value_props: exactly 3 items, pick most important benefits
- If hero_headline not found use the page title
- If subheadline not found use meta description
- cta_text: if multiple CTAs exist pick the most prominent one
- Never return null, use empty string if not found
- Raw JSON only, no markdown`;

  const parsed = await invokeLLMWithRetry(prompt);

  // Ensure page_url is set to the input URL
  parsed.page_url = url;

  try {
    const validated = pageProfileSchema.parse(parsed);
    const elapsed = Date.now() - startTime;
    console.log(`[PAGE CHAIN] Page profile validated in ${elapsed}ms`);
    console.log(`[PAGE CHAIN]    headline="${validated.hero_headline.substring(0, 60)}"`);
    console.log(`[PAGE CHAIN]    CTA="${validated.cta_text}"`);
    console.log(`[PAGE CHAIN]    tone="${validated.current_tone}"`);
    console.log("=".repeat(60) + "\n");
    return {
      profile: validated,
      screenshotBase64: scraped.screenshotBase64,
      brandColors: scraped.brandColors,
      faviconUrl: scraped.faviconUrl,
      fullHTML: scraped.fullHTML,
      elementSelectors: scraped.elementSelectors,
      baseUrl: scraped.baseUrl,
    };
  } catch (zodError: any) {
    console.error("[PAGE CHAIN] Zod validation failed!");
    console.error("[PAGE CHAIN]    Parsed data:", JSON.stringify(parsed));
    console.error("[PAGE CHAIN]    Errors:", JSON.stringify(zodError.errors || zodError.issues));
    throw new Error(
      `Page profile validation failed: ${JSON.stringify(zodError.errors || zodError.issues)}`
    );
  }
}
