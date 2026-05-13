import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface OpenRouterOptions {
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  timeout?: number;
  /**
   * When true, OpenRouter's `:online` suffix is appended to the model id,
   * which routes the request through Exa-powered web search. The model
   * receives the top results in its context and returns `annotations`
   * with `url_citation` entries describing each web source it used. The
   * stream/text path emits these annotations as a `LP_WEBSOURCES_JSON`
   * block so the frontend can render Grok-style source cards.
   */
  webSearch?: boolean;
  /**
   * Optional caller-supplied AbortSignal that cancels the in-flight
   * OpenRouter request (and its streaming body, if any). Combined with
   * the built-in timeout via `AbortSignal.any()` so whichever fires
   * first wins. Used by Agent Mode to stop work when the browser tab
   * disconnects so we don't keep burning API credits.
   */
  signal?: AbortSignal;
}

/**
 * Combine an optional caller signal with a timeout signal so either one
 * cancels the underlying fetch. Falls back to just the timeout signal
 * when no caller signal is supplied.
 */
function combineSignals(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal;
}

export interface WebSource {
  url: string;
  title: string;
  content: string;
}

interface OpenRouterResult {
  text?: string;
  stream?: ReadableStream;
  error?: string;
}

export interface OpenRouterImageResult {
  imageUrl?: string;
  text?: string;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Poe (poe.com) exposes an OpenAI-compatible chat-completions endpoint
// that proxies any Poe bot, including frontier models. When POE_KEY is
// configured we route Agent Mode through Poe so the user can use bots
// like Gemini-3.1-Pro for the long mock-exam tool chains where the
// cheaper OpenRouter defaults gave up early.
const POE_API_URL = 'https://api.poe.com/v1/chat/completions';

// Switched 2026-04 from deepseek/deepseek-v4-flash to z-ai/glm-4.6.
// (Used only when POE_KEY is unset — fallback OpenRouter route.)
const DEFAULT_MODEL = process.env.OPENROUTER_MODEL || 'z-ai/glm-4.6';

// Default Poe bot for Tutor + Code chat (used by `openrouterChat` when
// POE_KEY is set). Override with POE_CHAT_MODEL. Poe bot names are
// case-sensitive.
const DEFAULT_POE_CHAT_MODEL =
  process.env.POE_CHAT_MODEL || 'Claude-Opus-4.7';

// Default Poe bot used by Agent Mode when POE_KEY is set. Override with
// POE_AGENT_MODEL. Poe model ids are bot names — case sensitive.
const DEFAULT_POE_AGENT_MODEL =
  process.env.POE_AGENT_MODEL || 'Gemini-3.1-Pro';

/** True when a Poe API key is configured for routing through Poe. */
function poeKey(): string {
  return (process.env.POE_KEY || process.env.POE_API_KEY || '').trim();
}

// Reasoning configuration is intentionally NOT applied by default.
// Both `effort: 'low'` and `exclude: true` were observed to break
// deepseek-v4-pro: the former exhausted the reasoning budget before any
// content was produced, the latter returned a fully empty response.
// Letting the model use its own defaults yields a proper `content` reply
// and still streams reasoning tokens through `delta.reasoning`, which the
// stream parser below wraps in [[LP_THINK]]…[[/LP_THINK]] for the UI.

// Sentinels used to wrap reasoning ("thinking") tokens in the streaming
// text so the frontend can render them in a separate collapsible block.
const THINK_OPEN = '[[LP_THINK]]';
const THINK_CLOSE = '[[/LP_THINK]]';

// HTML-comment delimiters used to append web-search source data to the
// streamed text without disrupting markdown rendering. Mirrors the
// existing `LP_CITATIONS_JSON_START/END` convention used for KB sources.
const WEBSOURCES_START = '<!-- LP_WEBSOURCES_JSON_START -->';
const WEBSOURCES_END = '<!-- LP_WEBSOURCES_JSON_END -->';

/**
 * Normalise an OpenRouter `annotations` array into a flat `WebSource[]`.
 * Tolerates both the documented `{ type:"url_citation", url_citation:{} }`
 * shape and any future variations that put fields on the top-level object.
 */
function normalizeAnnotations(annotations: unknown): WebSource[] {
  if (!Array.isArray(annotations)) return [];
  const out: WebSource[] = [];
  for (const ann of annotations as Array<Record<string, unknown>>) {
    const inner = (ann?.url_citation as Record<string, unknown> | undefined) ?? ann;
    const url = typeof inner?.url === 'string' ? inner.url : null;
    if (!url) continue;
    const title =
      typeof inner?.title === 'string' && inner.title.trim().length > 0
        ? (inner.title as string)
        : url;
    const content =
      typeof inner?.content === 'string' ? (inner.content as string) : '';
    out.push({ url, title, content });
  }
  return out;
}

const REQUEST_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://learningpacer.app',
  'X-Title': 'LearningPacer',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retrieve the OpenRouter API key.
 *
 * Priority:
 *  1. `process.env.OPENROUTER_API_KEY`
 *  2. `AdminSetting` table  (key = 'openrouter_api_key')
 *  3. Returns empty string when neither is available.
 */
export async function getOpenRouterApiKey(): Promise<string> {
  // 1. Environment variable takes precedence (OPENROUTER_API_KEY or OPENAI_API_KEY)
  const envKey =
    process.env.OPENROUTER_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;

  // 2. Fall back to the database
  try {
    const setting = await db.adminSetting.findUnique({
      where: { key: 'openrouter_api_key' },
    });
    if (setting?.value?.trim()) return setting.value.trim();
  } catch (err) {
    console.error('[openrouter] Failed to read API key from database:', err);
  }

  return '';
}

// ─── Main function ──────────────────────────────────────────────────────────

/**
 * Send a chat completion request to the OpenRouter API.
 *
 * - When `options.stream` is `true`, returns `{ stream: ReadableStream }`
 *   whose chunks are **plain text** tokens extracted from the SSE data
 *   (`data: {"choices":[{"delta":{"content":"..."}}]}`) envelope.
 * - When `options.stream` is falsy (default), returns `{ text: string }`.
 * - On failure, returns `{ error: string }`.
 */
export async function openrouterChat(
  messages: ChatMessage[],
  options?: OpenRouterOptions,
): Promise<OpenRouterResult> {
  // Provider selection: when POE_KEY is set, route Tutor + Code chats
  // through Poe's OpenAI-compatible chat-completions endpoint and default
  // to `Claude-Opus-4.7`. Otherwise fall back to OpenRouter.
  const usePoe = !!poeKey();
  const apiUrl = usePoe ? POE_API_URL : OPENROUTER_API_URL;
  const apiKey = usePoe ? poeKey() : await getOpenRouterApiKey();
  if (!apiKey) {
    return {
      error: usePoe
        ? 'No Poe API key configured'
        : 'No OpenRouter API key configured',
    };
  }

  const baseModel =
    options?.model || (usePoe ? DEFAULT_POE_CHAT_MODEL : DEFAULT_MODEL);
  // OpenRouter routes the request through Exa-powered web search when the
  // model id ends with `:online`. Poe bots don't honour this suffix, so
  // only attach it on the OpenRouter path.
  const model =
    !usePoe && options?.webSearch && !baseModel.endsWith(':online')
      ? `${baseModel}:online`
      : baseModel;

  const body: Record<string, unknown> = {
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  };

  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;
  if (options?.stream) body.stream = true;
  // OpenRouter-only: pick the highest-throughput backend. Poe rejects
  // unknown top-level fields with a 400, so omit there.
  if (!usePoe) body.provider = { sort: 'throughput' };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        ...REQUEST_HEADERS,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combineSignals(options?.signal, options?.timeout || 180_000),
    });

    // ── Non-OK HTTP status ─────────────────────────────────────────────────
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.error || detail;
      } catch {
        // response body wasn't valid JSON – keep the status string
      }
      return { error: detail };
    }

    // ── Streaming path ─────────────────────────────────────────────────────
    if (options?.stream) {
      const stream: ReadableStream<Uint8Array> = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.error(new Error('No response body'));
            return;
          }

          const decoder = new TextDecoder();
          const encoder = new TextEncoder();
          let buffer = '';
          // Track whether we're currently emitting reasoning ("thinking")
          // tokens. When the stream switches between reasoning and content
          // we wrap the reasoning blocks in [[LP_THINK]]…[[/LP_THINK]] so
          // the frontend can render them in a collapsible "thinking" panel.
          // Typed as `string` because TS can't infer that the closures
          // below mutate `mode` through the `handleChoice` indirection.
          let mode: string = 'init';

          // Web sources accumulated from `delta.annotations` /
          // `delta.message.annotations` across the stream. Emitted as a
          // single LP_WEBSOURCES_JSON block right before stream close.
          const webSourcesByUrl = new Map<string, WebSource>();
          const collectAnnotations = (annotations: unknown) => {
            for (const src of normalizeAnnotations(annotations)) {
              if (!webSourcesByUrl.has(src.url)) webSourcesByUrl.set(src.url, src);
            }
          };

          const flushWebSources = () => {
            if (webSourcesByUrl.size === 0) return;
            const arr = Array.from(webSourcesByUrl.values());
            const block = `\n${WEBSOURCES_START}${JSON.stringify(arr)}${WEBSOURCES_END}`;
            controller.enqueue(encoder.encode(block));
          };

          const handleDelta = (
            delta:
              | {
                  content?: string;
                  reasoning?: string;
                  reasoning_content?: string;
                  annotations?: unknown;
                }
              | undefined,
          ) => {
            if (!delta) return;
            const reasoningTok = delta.reasoning ?? delta.reasoning_content;
            const contentTok = delta.content;

            if (reasoningTok) {
              if (mode !== 'think') {
                controller.enqueue(encoder.encode(THINK_OPEN));
                mode = 'think';
              }
              controller.enqueue(encoder.encode(reasoningTok));
            }
            if (contentTok) {
              if (mode === 'think') {
                controller.enqueue(encoder.encode(THINK_CLOSE));
              }
              mode = 'content';
              controller.enqueue(encoder.encode(contentTok));
            }
            if (delta.annotations) collectAnnotations(delta.annotations);
          };

          const handleChoice = (choice: Record<string, unknown> | undefined) => {
            if (!choice) return;
            handleDelta(
              choice.delta as {
                content?: string;
                reasoning?: string;
                reasoning_content?: string;
                annotations?: unknown;
              } | undefined,
            );
            // Some providers attach annotations on `message` (final chunk)
            // or directly on the choice object. Capture both.
            const msg = choice.message as { annotations?: unknown } | undefined;
            if (msg?.annotations) collectAnnotations(msg.annotations);
            if ((choice as { annotations?: unknown }).annotations) {
              collectAnnotations((choice as { annotations?: unknown }).annotations);
            }
          };

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              // Keep the last (possibly incomplete) line in the buffer
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;

                const payload = trimmed.slice(6); // strip "data: "
                if (payload === '[DONE]') {
                  if (mode === 'think') controller.enqueue(encoder.encode(THINK_CLOSE));
                  flushWebSources();
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(payload);
                  handleChoice(parsed.choices?.[0]);
                } catch {
                  // Ignore malformed JSON lines – OpenRouter may send keep-alive comments
                }
              }
            }

            // Process any remaining data in the buffer
            if (buffer.trim()) {
              const trimmed = buffer.trim();
              if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
                try {
                  const parsed = JSON.parse(trimmed.slice(6));
                  handleChoice(parsed.choices?.[0]);
                } catch {
                  // Ignore
                }
              }
            }

            if (mode === 'think') controller.enqueue(encoder.encode(THINK_CLOSE));
            flushWebSources();
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return { stream };
    }

    // ── Non-streaming path ─────────────────────────────────────────────────
    const data = await response.json();
    const message = data.choices?.[0]?.message;
    const text = message?.content as string | undefined;

    if (!text) {
      return { error: 'Empty response from OpenRouter' };
    }

    // If OpenRouter returned web-search annotations, append them as a
    // LP_WEBSOURCES_JSON block so the frontend renders source cards.
    const webSources = normalizeAnnotations(message?.annotations);
    const finalText =
      webSources.length > 0
        ? `${text}\n${WEBSOURCES_START}${JSON.stringify(webSources)}${WEBSOURCES_END}`
        : text;

    return { text: finalText };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { error: `OpenRouter request failed: ${message}` };
  }
}

// ─── Tool-calling (function calling) ────────────────────────────────────────

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

export type AgentMessage =
  | ChatMessage
  | (ChatMessage & { tool_calls?: ToolCall[] })
  | ToolMessage;

export interface OpenRouterToolResult {
  /** Final assistant content (when the model stops calling tools). */
  content?: string;
  /** Tool calls the model wants us to execute. */
  toolCalls?: ToolCall[];
  /** finish_reason from the provider, e.g. 'stop' | 'tool_calls' | 'length'. */
  finishReason?: string;
  error?: string;
}

/**
 * Send a non-streaming chat completion that supports OpenAI-compatible
 * function/tool calling. Used by the Agent Mode loop where each iteration
 * is one model call followed by zero or more tool executions.
 */
export async function openrouterChatWithTools(
  messages: AgentMessage[],
  tools: Array<{ type: 'function'; function: unknown }>,
  options?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    timeout?: number;
    tool_choice?: 'auto' | 'required' | 'none';
    /**
     * Reasoning effort budget. Maps to OpenRouter's normalised
     * `reasoning: { effort }` field, which is auto-translated to the
     * provider-native config (Gemini → `thinkingConfig.thinkingBudget`,
     * Anthropic → `thinking`, OpenAI → `reasoning_effort`, etc.).
     * No-op when routing through Poe (Poe bots use bot defaults).
     */
    reasoning?: 'low' | 'medium' | 'high' | 'none';
    /** Caller-supplied AbortSignal — see OpenRouterOptions.signal docs. */
    signal?: AbortSignal;
  },
): Promise<OpenRouterToolResult> {
  // ── Provider selection ─────────────────────────────────────────────────
  // When POE_KEY is set, route Agent Mode through Poe's OpenAI-compatible
  // chat-completions endpoint and default to Gemini-3.1-Pro. Otherwise
  // fall back to OpenRouter with the GLM-4.6 default. The caller may
  // override the model via options.model in either case.
  const usePoe = !!poeKey();
  const apiUrl = usePoe ? POE_API_URL : OPENROUTER_API_URL;
  const apiKey = usePoe ? poeKey() : await getOpenRouterApiKey();
  if (!apiKey) {
    return {
      error: usePoe
        ? 'No Poe API key configured'
        : 'No OpenRouter API key configured',
    };
  }

  const model =
    options?.model || (usePoe ? DEFAULT_POE_AGENT_MODEL : DEFAULT_MODEL);

  const body: Record<string, unknown> = {
    model,
    messages,
    tools,
    tool_choice: options?.tool_choice ?? 'auto',
  };
  // OpenRouter-specific: pick the highest-throughput backend. Poe doesn't
  // accept this field, so only attach when routing through OpenRouter.
  if (!usePoe) body.provider = { sort: 'throughput' };
  if (options?.temperature !== undefined) body.temperature = options.temperature;
  if (options?.max_tokens !== undefined) body.max_tokens = options.max_tokens;

  // Reasoning effort: only forwarded on the OpenRouter path. OpenRouter
  // normalises `reasoning.effort` per provider (Gemini → thinkingBudget,
  // OpenAI → reasoning_effort, Anthropic → thinking, etc.). Poe's bot
  // wrapper does not expose this knob via the OpenAI-compat endpoint —
  // the bot's own default budget is used there.
  if (!usePoe && options?.reasoning && options.reasoning !== 'none') {
    body.reasoning = { effort: options.reasoning };
  }

  // Retry transient upstream failures. OpenRouter's "Provider returned
  // error" / 502 / 503 / 504 / 429 responses are usually a single
  // upstream provider hiccupping; a quick retry typically succeeds (and
  // OpenRouter's own provider fallback may pick a different provider on
  // the second attempt). Bail out immediately on user-aborted signals
  // and on errors that aren't worth retrying (auth, bad request, etc.).
  const MAX_ATTEMPTS = 3;
  let lastError = 'Unknown error';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          ...REQUEST_HEADERS,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: combineSignals(options?.signal, options?.timeout || 180_000),
      });

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          detail = errBody?.error?.message || errBody?.error || detail;
        } catch {
          // keep status string
        }

        const retryable =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500 ||
          /provider returned error|temporar|timeout|unavailable|rate limit/i.test(
            detail,
          );
        lastError = detail;
        if (retryable && attempt < MAX_ATTEMPTS && !options?.signal?.aborted) {
          await sleep(backoffMs(attempt));
          continue;
        }
        return { error: detail };
      }

      const data = await response.json();
      const choice = data?.choices?.[0];
      const message = choice?.message;
      const finishReason: string | undefined = choice?.finish_reason;

      const toolCalls: ToolCall[] | undefined = Array.isArray(
        message?.tool_calls,
      )
        ? (message.tool_calls as ToolCall[])
        : undefined;
      const content: string | undefined =
        typeof message?.content === 'string' ? message.content : undefined;

      return {
        content: content && content.length > 0 ? content : undefined,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        finishReason,
      };
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Unknown error';
      lastError = detail;
      // AbortError = client disconnected or per-call timeout fired.
      // Either way, don't retry — the caller will surface the right
      // user-facing message.
      const aborted =
        options?.signal?.aborted ||
        (err instanceof Error && err.name === 'AbortError');
      if (aborted || attempt >= MAX_ATTEMPTS) {
        return { error: `OpenRouter request failed: ${detail}` };
      }
      await sleep(backoffMs(attempt));
    }
  }

  return { error: `OpenRouter request failed: ${lastError}` };
}

function backoffMs(attempt: number): number {
  // 800ms, 2400ms — quick enough not to feel laggy, long enough for an
  // upstream provider to recover or for OpenRouter to reroute.
  return 800 * Math.pow(3, attempt - 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Image generation ───────────────────────────────────────────────────────

/** True when a Poe API key is configured. Re-exported helper so the
 * /api/chat/image route can decide between Poe (preferred for the
 * Nano-Banana-Pro bot) and OpenRouter without re-implementing the env
 * lookup. */
export function hasPoeKey(): boolean {
  return poeKey().length > 0;
}

const DEFAULT_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL || 'google/gemini-2.5-flash-image';

/** Default Poe image bot. Overridable via POE_IMAGE_MODEL. Bot names are
 * case-sensitive on Poe — `Gemini-3-Nano-Banana-Pro` is the Google
 * Imagen-3 derived bot exposed on Poe. */
const DEFAULT_POE_IMAGE_MODEL =
  process.env.POE_IMAGE_MODEL || 'Gemini-3-Nano-Banana-Pro';

export async function openrouterImage(
  prompt: string,
  options?: { model?: string; timeout?: number; modalities?: string[] },
): Promise<OpenRouterImageResult> {
  const apiKey = await getOpenRouterApiKey();
  if (!apiKey) {
    return { error: 'No OpenRouter API key configured' };
  }

  const model = options?.model || DEFAULT_IMAGE_MODEL;
  // Image-only models (like bytedance-seed/seedream-4.5) reject ['image','text'].
  // Default to image-only; gemini-style models that need both text+image can override.
  const modalities = options?.modalities || ['image'];

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    modalities,
  };

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        ...REQUEST_HEADERS,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options?.timeout || 120_000),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.error || detail;
      } catch {
        // ignore
      }
      return { error: detail };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;

    // Try every known response shape:
    let imageUrl: string | undefined;
    let text = '';

    // Shape A: message.images = [{ image_url: { url } }]
    if (Array.isArray(message?.images)) {
      for (const img of message.images) {
        const u = img?.image_url?.url || img?.url;
        if (typeof u === 'string') { imageUrl = u; break; }
      }
    }

    // Shape B: message.content is a string — could be plain text or a data URL
    if (!imageUrl && typeof message?.content === 'string') {
      const c = message.content.trim();
      if (c.startsWith('data:image/') || /^https?:\/\/\S+\.(png|jpe?g|webp|gif)/i.test(c)) {
        imageUrl = c;
      } else {
        text = c;
      }
    }

    // Shape C: message.content is an array of parts (image_url + text mixed)
    if (Array.isArray(message?.content)) {
      for (const p of message.content as Array<{ type?: string; text?: string; image_url?: { url?: string } | string }>) {
        if (!imageUrl && (p?.type === 'image_url' || p?.type === 'image')) {
          const u = typeof p.image_url === 'string' ? p.image_url : p.image_url?.url;
          if (typeof u === 'string') imageUrl = u;
        } else if (p?.type === 'text' && p.text) {
          text += p.text;
        }
      }
    }

    if (!imageUrl) {
      console.error('[openrouter] No image found in response. Full payload:', JSON.stringify(data).slice(0, 1500));
      return { error: 'No image returned from model' };
    }

    return { imageUrl, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { error: `OpenRouter image request failed: ${message}` };
  }
}

/**
 * Generate an image through Poe's OpenAI-compatible chat-completions
 * endpoint. Targets image-generation bots like `Gemini-3-Nano-Banana-Pro`.
 *
 * Poe image bots return the rendered image either as:
 *   – a markdown link inside `message.content`  (e.g. `![](https://…png)`)
 *   – a bare URL inside `message.content`
 *   – an `attachments[]` array with `{ url, content_type:"image/…" }`
 *
 * We try each shape in order and return the first usable URL. The remaining
 * non-image text (if any) is returned in `text` for the caller to surface.
 */
export async function poeImage(
  prompt: string,
  options?: { model?: string; timeout?: number },
): Promise<OpenRouterImageResult> {
  const apiKey = poeKey();
  if (!apiKey) {
    return { error: 'No Poe API key configured' };
  }

  const model = options?.model || DEFAULT_POE_IMAGE_MODEL;

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
  };

  try {
    const response = await fetch(POE_API_URL, {
      method: 'POST',
      headers: {
        ...REQUEST_HEADERS,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options?.timeout || 120_000),
    });

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || errBody?.error || detail;
      } catch {
        // ignore
      }
      return { error: `Poe image request failed: ${detail}` };
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;

    let imageUrl: string | undefined;
    let text = '';

    // Shape A: attachments array (Poe-native).
    const attachments = (message as { attachments?: unknown })?.attachments;
    if (Array.isArray(attachments)) {
      for (const att of attachments as Array<{ url?: string; content_type?: string }>) {
        if (typeof att?.url === 'string' && /^https?:\/\//i.test(att.url)) {
          if (!att.content_type || att.content_type.startsWith('image/')) {
            imageUrl = att.url;
            break;
          }
        }
      }
    }

    // Shape B: message.content as a markdown image or bare URL.
    if (!imageUrl && typeof message?.content === 'string') {
      const c = message.content as string;
      const md = c.match(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
      if (md) {
        imageUrl = md[1];
      } else {
        const bare = c.match(/(https?:\/\/\S+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)]*)?)/i);
        if (bare) imageUrl = bare[1];
      }
      // Whatever text remains after stripping the URL becomes the caption.
      text = c
        .replace(/!\[[^\]]*\]\(https?:\/\/[^)]+\)/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();
    }

    // Shape C: structured content parts (defensive fallback).
    if (!imageUrl && Array.isArray(message?.content)) {
      for (const p of message.content as Array<{ type?: string; text?: string; image_url?: { url?: string } | string }>) {
        if (!imageUrl && (p?.type === 'image_url' || p?.type === 'image')) {
          const u = typeof p.image_url === 'string' ? p.image_url : p.image_url?.url;
          if (typeof u === 'string') imageUrl = u;
        } else if (p?.type === 'text' && p.text) {
          text += p.text;
        }
      }
    }

    if (!imageUrl) {
      console.error(
        '[poe] No image found in response. Full payload:',
        JSON.stringify(data).slice(0, 1500),
      );
      return { error: 'No image returned from Poe' };
    }

    return { imageUrl, text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { error: `Poe image request failed: ${message}` };
  }
}
