import OpenAI from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import { parseJsonFromModel } from './parseJson';

const DEFAULT_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5.5';

let client: OpenAI | undefined;

function getClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required');
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/** GPT-5+ and reasoning models use max_completion_tokens instead of max_tokens. */
function usesMaxCompletionTokens(model: string): boolean {
  return /^gpt-5/i.test(model) || /^o[0-9]/i.test(model);
}

export type GenerateJsonOptions = {
  prompt: string;
  maxTokens?: number;
  model?: string;
};

const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateJson<T = unknown>(options: GenerateJsonOptions): Promise<T> {
  const model = options.model ?? DEFAULT_MODEL;
  const tokenLimit = options.maxTokens ?? 2000;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const params: ChatCompletionCreateParamsNonStreaming = {
      model,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: options.prompt }],
    };

    if (usesMaxCompletionTokens(model)) {
      params.max_completion_tokens = tokenLimit;
    } else {
      params.max_tokens = tokenLimit;
    }

    try {
      const response = await getClient().chat.completions.create(params);
      const choice = response.choices[0];
      const raw = choice?.message?.content;

      if (raw) {
        return parseJsonFromModel(raw) as T;
      }

      const finishReason = choice?.finish_reason ?? 'unknown';
      lastError = new Error(
        `OpenAI returned empty content (finish_reason=${finishReason}, attempt ${attempt}/${MAX_ATTEMPTS})`
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < MAX_ATTEMPTS) {
      const delayMs = attempt * 2000;
      console.warn(`${lastError.message} — retrying in ${delayMs}ms...`);
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('OpenAI returned empty content');
}
