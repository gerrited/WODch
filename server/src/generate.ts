import Anthropic from '@anthropic-ai/sdk'
import type { RateLimiter } from './rateLimit.js'

export const GENERATE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 800,
  maxPromptChars: 500,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Erstelle aus dem Wunsch des Nutzers ein ' +
    'einzelnes Workout. Gib ausschließlich das Workout als reinen, zentrierbaren Monospace-Text ' +
    'zurück — keine Einleitung, keine Markdown-Formatierung, keine Erklärungen. Halte dich kurz.',
} as const

export interface GenerateDeps {
  rateLimiter: RateLimiter
  hasApiKey: () => boolean
  generateWorkout: (prompt: string) => Promise<string>
}

export interface GenerateResult {
  status: number
  body: object
}

export async function handleGenerate(
  input: { prompt: unknown; ip: string },
  deps: GenerateDeps,
): Promise<GenerateResult> {
  if (!deps.hasApiKey()) {
    return { status: 503, body: { error: 'AI-Generierung ist nicht konfiguriert.' } }
  }
  if (!deps.rateLimiter.allow(input.ip)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt || prompt.length > GENERATE_CONFIG.maxPromptChars) {
    return { status: 400, body: { error: 'Ungültiger Wunsch-Text.' } }
  }
  try {
    const workout = await deps.generateWorkout(prompt)
    return { status: 200, body: { workout } }
  } catch {
    return { status: 500, body: { error: 'Generierung fehlgeschlagen.' } }
  }
}

export function hasApiKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

// Dünner SDK-Wrapper — bewusst nicht unit-getestet (kein Live-Call in Tests).
export async function generateWorkout(prompt: string): Promise<string> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: GENERATE_CONFIG.model,
    max_tokens: GENERATE_CONFIG.maxTokens,
    system: GENERATE_CONFIG.systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  })
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()
}
