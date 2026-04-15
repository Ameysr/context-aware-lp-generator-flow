import { GoogleGenerativeAI } from "@google/generative-ai";

interface VisionInput {
  imageBase64: string;
  mimeType: string;
}

export async function analyzeAdImage(input: VisionInput): Promise<string> {
  console.log("[GEMINI VISION] Processing image...");

  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in environment variables.");
  }

  // Check image size — base64 string length * 0.75 ≈ bytes
  const approximateBytes = input.imageBase64.length * 0.75;
  if (approximateBytes > 4 * 1024 * 1024) {
    throw new Error("Image too large. Please use an image under 4MB.");
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const imagePart = {
    inlineData: {
      data: input.imageBase64,
      mimeType: input.mimeType,
    },
  };

  const prompt = `You are an expert ad creative analyst.
Analyze this advertisement image carefully and describe it in detail.

Extract and describe:
1. The main headline or hook text visible in the ad
2. The product or service being advertised
3. The main offer (discount, free trial, feature highlight etc.)
4. The call-to-action text (button or instruction)
5. The target audience this ad seems to be aimed at
6. The visual tone (colors, style: professional/playful/urgent/minimal)
7. The single most important benefit being promised
8. Any urgency signals (limited time, countdown, scarcity language)

Write a detailed paragraph covering all these points.
Be specific. If text is visible in the image, quote it exactly.
Do not add information that is not visible in the image.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const result = await model.generateContent([prompt, imagePart]);
    clearTimeout(timeout);

    const response = result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      throw new Error("Gemini returned an empty response.");
    }

    console.log("[GEMINI VISION] Image analysis complete.");
    return text;
  } catch (error: any) {
    console.error("[GEMINI VISION] Error:", error.message);
    throw new Error(
      "Image analysis failed. Please try pasting the ad text instead."
    );
  }
}
