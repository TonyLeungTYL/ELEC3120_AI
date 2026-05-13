import {
  openrouterChat,
  openrouterImage,
  poeImage,
  hasPoeKey,
  type ChatMessage,
} from '@/lib/openrouter';
import { db } from '@/lib/db';

// When a Poe key is configured we route image generation through Poe's
// `Gemini-3-Nano-Banana-Pro` bot (Google's Nano Banana Pro). Otherwise
// fall back to the OpenRouter Seedream 4.5 default.
const POE_IMAGE_MODEL =
  process.env.POE_IMAGE_MODEL || 'Gemini-3-Nano-Banana-Pro';
const OPENROUTER_FALLBACK_IMAGE_MODEL =
  process.env.OPENROUTER_IMAGE_MODEL || 'bytedance-seed/seedream-4.5';

const PROMPT_REFINER = `You are an expert image-generation prompt engineer. Convert the user's request (in any language) into a SINGLE concise English prompt for a Flux / Stable Diffusion text-to-image model.

Rules:
- Output ONLY the final English prompt. No quotes, no preamble, no explanation, no markdown.
- Be vivid and specific: subject, action, setting, lighting, style, composition, color palette.
- 40–110 words.
- If the user already provided a polished English prompt, lightly refine it.
- Add quality boosters when natural: "highly detailed, sharp focus, cinematic lighting, 8k" or "trending on artstation".
- For technical / educational diagrams (network topology, sequence diagram, etc.), describe it as a clean infographic / vector illustration with labels.`;

function buildPollinationsUrl(prompt: string, seed: number): string {
  const params = new URLSearchParams({
    width: '1024',
    height: '1024',
    model: 'flux',
    nologo: 'true',
    seed: String(seed),
  });
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, conversationId } = body as {
      messages?: Array<{ role: string; content: string }>;
      conversationId?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Messages array is required' }, { status: 400 });
    }

    const lastMessage = messages[messages.length - 1];
    const userPrompt = (lastMessage?.content || '').trim();
    if (!userPrompt) {
      return Response.json({ error: 'Prompt is required' }, { status: 400 });
    }

    // Save user message
    if (conversationId && lastMessage.role === 'user') {
      try {
        await db.message.create({
          data: { conversationId, role: 'user', content: userPrompt },
        });
        await db.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      } catch (e) {
        console.error('Failed to save user message:', e);
      }
    }

    // 1. Refine into an English image-gen prompt
    let englishPrompt = userPrompt;
    try {
      const refineMessages: ChatMessage[] = [
        { role: 'system', content: PROMPT_REFINER },
        { role: 'user', content: userPrompt },
      ];
      // Tiny prompt-refine call — needs a Poe bot when POE_KEY is set,
      // otherwise the Poe API rejects the OpenRouter slug.
      const refineModel =
        process.env.POE_PROMPT_REFINE_MODEL ||
        process.env.OPENROUTER_MODEL ||
        (process.env.POE_KEY || process.env.POE_API_KEY
          ? 'Gemini-3.1-Pro'
          : 'xiaomi/mimo-v2-pro');
      const refined = await openrouterChat(refineMessages, { model: refineModel });
      const refinedText = refined.text?.trim();
      if (refinedText) {
        englishPrompt = refinedText
          .replace(/^["'`]+|["'`]+$/g, '')
          .replace(/^(Prompt|prompt|PROMPT)\s*[:：]\s*/, '')
          .trim();
      }
    } catch (e) {
      console.error('Prompt refinement failed, using raw user prompt:', e);
    }

    // 2. Generate image — prefer Poe `Gemini-3-Nano-Banana-Pro` when a
    // Poe key is configured, fall back to OpenRouter, then Pollinations.
    const usePoe = hasPoeKey();
    const primaryModel = usePoe ? POE_IMAGE_MODEL : OPENROUTER_FALLBACK_IMAGE_MODEL;
    const imgResult = usePoe
      ? await poeImage(englishPrompt, { model: POE_IMAGE_MODEL })
      : await openrouterImage(englishPrompt, { model: OPENROUTER_FALLBACK_IMAGE_MODEL });

    let imageUrl: string;
    let providerLabel: string;
    if (imgResult.imageUrl) {
      imageUrl = imgResult.imageUrl;
      providerLabel = `由 ${primaryModel} 即時生成`;
    } else {
      // Fallback to Pollinations if the primary model fails
      console.error(
        `${usePoe ? 'Poe' : 'OpenRouter'} image gen failed, falling back to Pollinations:`,
        imgResult.error,
      );
      const seed = Math.floor(Math.random() * 1_000_000);
      imageUrl = buildPollinationsUrl(englishPrompt, seed);
      providerLabel = `由 Pollinations × Flux 生成（${primaryModel} 失敗：${imgResult.error || 'unknown'}）`;
    }

    // 3. Build markdown response
    const altText = englishPrompt.slice(0, 80).replace(/[\[\]]/g, '');
    const responseText =
      `![${altText}](${imageUrl})\n\n` +
      `**🎨 Prompt：** ${englishPrompt}\n\n` +
      `*${providerLabel} · 點圖可放大 / 右鍵可下載*`;

    // 4. Save assistant message
    if (conversationId) {
      try {
        await db.message.create({
          data: { conversationId, role: 'assistant', content: responseText },
        });
      } catch (e) {
        console.error('Failed to save assistant message:', e);
      }
    }

    // 5. Return as a stream so page.tsx (which reads res.body as a stream) can handle it uniformly
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(responseText));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (error) {
    console.error('Image generation route error:', error);
    return Response.json({ error: 'Image generation failed' }, { status: 500 });
  }
}
