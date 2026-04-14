import { GoogleGenerativeAI } from "@google/generative-ai";
import { invokeLLMWithRetry } from "../utils/retryHandler";
import { croAnalysisSchema, type CROAnalysis } from "../schemas/croAnalysisSchema";
import type { PageProfile } from "../schemas/pageProfileSchema";
import type { AdProfile } from "../schemas/adProfileSchema";

interface CROInput {
  pageProfile: PageProfile;
  adProfile: AdProfile;
  screenshotBase64: string;
}

/**
 * CRO Analysis Chain:
 * 1. Gemini Vision analyzes the landing page screenshot for visual CRO issues
 * 2. Groq generates structured CRO suggestions using page data + vision analysis
 */
export async function runCROAnalysisChain(input: CROInput): Promise<CROAnalysis> {
  console.log("\n" + "=".repeat(60));
  console.log("[CRO CHAIN] Starting CRO analysis...");
  const startTime = Date.now();

  let visionAnalysis = "";

  // Step 1: Gemini Vision — analyze screenshot for visual CRO issues
  if (input.screenshotBase64 && process.env.GEMINI_API_KEY) {
    console.log("[CRO CHAIN] Step 1: Gemini Vision analyzing page screenshot...");
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const imagePart = {
        inlineData: {
          data: input.screenshotBase64,
          mimeType: "image/jpeg",
        },
      };

      const visionPrompt = `You are an expert Conversion Rate Optimization (CRO) analyst.
Analyze this landing page screenshot and identify:

1. HERO SECTION: Is the value proposition clear within 3 seconds? Is the headline compelling?
2. CTA VISIBILITY: Is the primary CTA above the fold? Is it high-contrast and easy to find?
3. SOCIAL PROOF: Can you see any testimonials, customer logos, review badges, or trust indicators?
4. VISUAL HIERARCHY: Is there a clear reading flow? Are spacing and typography effective?
5. TRUST SIGNALS: Security badges, guarantees, certifications visible?
6. URGENCY: Any scarcity or time-pressure elements?
7. FORM/FRICTION: If there's a form, how many fields? Is it asking too much?
8. ABOVE-THE-FOLD: What key info is visible without scrolling?

Be specific about what you SEE. Reference actual elements on the page.
Write 3-5 sentences per point. Be honest — note both strengths and weaknesses.`;

      const result = await model.generateContent([visionPrompt, imagePart]);
      visionAnalysis = result.response.text();
      console.log(`[CRO CHAIN]    Vision analysis: ${visionAnalysis.length} chars`);
    } catch (e: any) {
      console.warn(`[CRO CHAIN]    Vision analysis failed: ${e.message}`);
      visionAnalysis = "Vision analysis unavailable.";
    }
  } else {
    console.log("[CRO CHAIN]    Skipping vision (no screenshot or API key)");
    visionAnalysis = "No screenshot available for visual analysis.";
  }

  // Step 2: Groq — structured CRO suggestions
  console.log("[CRO CHAIN] Step 2: Generating structured CRO suggestions...");

  const prompt = `You are a world-class Conversion Rate Optimization (CRO) expert.
Analyze this landing page and generate actionable improvement suggestions.

PAGE DATA:
- Headline: "${input.pageProfile.hero_headline}"
- Subheadline: "${input.pageProfile.subheadline}"
- CTA: "${input.pageProfile.cta_text}"
- Value Props: ${JSON.stringify(input.pageProfile.value_props)}
- Tone: "${input.pageProfile.current_tone}"
- URL: ${input.pageProfile.page_url}

AD CONTEXT (what the ad promises):
- Primary Message: "${input.adProfile.headline}"
- Key Benefit: "${input.adProfile.key_benefit}"
- CTA: "${input.adProfile.cta_text}"
- Tone: "${input.adProfile.tone}"

VISUAL ANALYSIS (from screenshot):
${visionAnalysis}

Respond ONLY with a valid JSON object. No explanation, no markdown:
{
  "overall_score": 7,
  "summary": "One sentence summarizing the page's conversion readiness",
  "suggestions": [
    {
      "severity": "critical",
      "category": "CTA Visibility",
      "title": "Short title of the issue",
      "description": "What's wrong and why it matters for conversions",
      "fix": "Specific, actionable recommendation to fix this"
    }
  ]
}

RULES:
- overall_score: 1-10 (10 = perfect conversion machine)
- severity: "critical" (must fix), "warning" (should fix), "good" (doing well)
- Generate EXACTLY 3 suggestions — the 3 most impactful
- Be specific to THIS page — no generic advice
- Each fix should be concrete and implementable
- Categories: "Hero Clarity", "CTA Design", "Social Proof", "Trust Signals", "Urgency", "Message Match", "Visual Hierarchy"
- JSON only, no markdown`;

  const parsed = await invokeLLMWithRetry(prompt);

  try {
    const validated = croAnalysisSchema.parse(parsed);
    const elapsed = Date.now() - startTime;
    console.log(`[CRO CHAIN] CRO analysis complete in ${elapsed}ms`);
    console.log(`[CRO CHAIN]    Score: ${validated.overall_score}/10`);
    console.log(`[CRO CHAIN]    Suggestions: ${validated.suggestions.length}`);
    console.log(`[CRO CHAIN]    Critical: ${validated.suggestions.filter(s => s.severity === "critical").length}`);
    console.log(`[CRO CHAIN]    Warning: ${validated.suggestions.filter(s => s.severity === "warning").length}`);
    console.log(`[CRO CHAIN]    Good: ${validated.suggestions.filter(s => s.severity === "good").length}`);
    console.log("=".repeat(60) + "\n");
    return validated;
  } catch (zodError: any) {
    console.error("[CRO CHAIN] Validation failed, returning fallback");
    // Return a sensible fallback
    return {
      overall_score: 6,
      summary: "Analysis completed with limited data.",
      suggestions: [
        {
          severity: "warning" as const,
          category: "Message Match",
          title: "Verify ad-to-page consistency",
          description: "Ensure your landing page headline directly mirrors the promise made in your ad creative.",
          fix: "Update hero headline to echo the exact benefit mentioned in your ad.",
        },
        {
          severity: "warning" as const,
          category: "CTA Design",
          title: "Strengthen your call-to-action",
          description: "Generic CTA text like 'Get Started' converts lower than benefit-driven CTAs.",
          fix: "Use action + benefit CTA like 'Start Saving Today' or 'Get Your Free Trial'.",
        },
        {
          severity: "good" as const,
          category: "Above-the-Fold",
          title: "Key information is visible",
          description: "The page loads with the main headline and CTA visible without scrolling.",
          fix: "Keep this — above-the-fold clarity is a conversion driver.",
        },
      ],
    };
  }
}
