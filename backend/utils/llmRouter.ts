import { ChatGroq } from "@langchain/groq";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

let activeLLM: "groq" | "deepseek" = "groq";

function createGroqLLM(): BaseChatModel {
  console.log("[LLM ROUTER] Creating Groq instance → model: llama-3.3-70b-versatile");
  return new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
    temperature: 0.1,
    maxTokens: 1000,
  });
}

function createDeepSeekLLM(): BaseChatModel {
  console.log("[LLM ROUTER] Creating DeepSeek instance → model: deepseek-chat");
  return new ChatOpenAI({
    openAIApiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: "https://api.deepseek.com",
    },
    modelName: "deepseek-chat",
    temperature: 0.1,
    maxTokens: 1000,
  });
}

export function getLLM(): BaseChatModel {
  if (activeLLM === "deepseek") {
    console.log("[LLM ROUTER] Using DeepSeek (fallback active)");
    return createDeepSeekLLM();
  }
  console.log("[LLM ROUTER] Using Groq (primary)");
  return createGroqLLM();
}

export function switchToFallback(): void {
  activeLLM = "deepseek";
  console.log("[LLM ROUTER] SWITCHED to DeepSeek fallback");
}

export function resetToPrimary(): void {
  activeLLM = "groq";
  console.log("[LLM ROUTER] Reset to Groq primary");
}

export function getActiveLLM(): "groq" | "deepseek" {
  return activeLLM;
}

/**
 * Invoke LLM with automatic fallback on rate limits or timeouts.
 * Wraps the call with a timeout and catches 429 errors.
 */
export async function invokeLLM(prompt: string): Promise<string> {
  const llm = getLLM();
  const promptPreview = prompt.substring(0, 120).replace(/\n/g, " ");
  console.log(`[LLM INVOKE] Sending prompt (${prompt.length} chars): "${promptPreview}..."`);
  const startTime = Date.now();

  try {
    const response = await Promise.race([
      llm.invoke(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("LLM_TIMEOUT")), 10000)
      ),
    ]);

    const elapsed = Date.now() - startTime;
    const content =
      typeof response.content === "string"
        ? response.content
        : JSON.stringify(response.content);

    console.log(`[LLM INVOKE] Response received in ${elapsed}ms (${content.length} chars)`);
    console.log(`[LLM INVOKE] Response preview: "${content.substring(0, 200)}..."`);
    return content;
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    const isRateLimit =
      error?.status === 429 || error?.message === "LLM_TIMEOUT";
    const isModelError = error?.status === 400;

    console.error(`[LLM INVOKE] FAILED after ${elapsed}ms`);
    console.error(`[LLM INVOKE]    Error: ${error.message}`);
    console.error(`[LLM INVOKE]    Status: ${error?.status || "N/A"}`);
    console.error(`[LLM INVOKE]    Active LLM: ${activeLLM}`);

    if ((isRateLimit || isModelError) && activeLLM === "groq") {
      console.log("[LLM INVOKE] Groq failed, switching to DeepSeek...");
      switchToFallback();
      return invokeLLM(prompt); // Retry with DeepSeek
    }

    throw error;
  }
}
