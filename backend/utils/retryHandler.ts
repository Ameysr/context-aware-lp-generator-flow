import { invokeLLM } from "./llmRouter";

/**
 * Invoke LLM and parse JSON response with automatic retry on parse failure.
 * Max 2 attempts — first attempt + 1 corrective retry.
 */
export async function invokeLLMWithRetry(
  prompt: string,
  maxRetries: number = 1
): Promise<any> {
  let lastError: Error | null = null;
  let lastRawResponse: string = "";

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const currentPrompt =
        attempt === 0
          ? prompt
          : `${prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Return ONLY the raw JSON object with no explanation or markdown.`;

      console.log(`[RETRY HANDLER] Attempt ${attempt + 1}/${maxRetries + 1}...`);

      const response = await invokeLLM(currentPrompt);
      lastRawResponse = response;

      // Strip any markdown code fences the LLM might add despite instructions
      let cleaned = response
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/gi, "")
        .trim();

      // Also try to extract JSON if there's surrounding text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      console.log(`[RETRY HANDLER] Parsing JSON (${cleaned.length} chars)...`);

      const parsed = JSON.parse(cleaned);
      console.log(`[RETRY HANDLER] JSON parsed successfully:`, JSON.stringify(parsed).substring(0, 200));
      return parsed;
    } catch (error: any) {
      lastError = error;
      console.error(`[RETRY HANDLER] Attempt ${attempt + 1} failed: ${error.message}`);
      if (lastRawResponse) {
        console.error(`[RETRY HANDLER]    Raw response was: "${lastRawResponse.substring(0, 300)}"`);
      }
      if (attempt < maxRetries) {
        console.log(`[RETRY HANDLER] Retrying with corrective prompt...`);
      }
    }
  }

  console.error(`[RETRY HANDLER] All ${maxRetries + 1} attempts exhausted.`);
  throw new Error(
    `AI parsing failed after ${maxRetries + 1} attempts: ${lastRawResponse.substring(0, 500)}`
  );
}
