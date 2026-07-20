import Anthropic from '@anthropic-ai/sdk'
import { GLOBAL_BUDGET_KEY, type RateLimiter } from './rateLimit.js'

export const GENERATE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 1500,
  maxPromptChars: 500,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Erstelle aus dem Wunsch des ' +
    'Nutzers ein Workout als reinen, zentrierbaren Monospace-Text — keine Einleitung, ' +
    'keine Markdown-Formatierung, keine Erklärungen. Wenn es sinnvoll ist, gliedere das ' +
    'Workout in Phasen (z. B. Warm-up, das eigentliche Workout, Skill/Accessory, ' +
    'Cooldown). Trenne jede Phase durch eine eigene Zeile im Format "=== Titel ===" ' +
    'direkt vor ihrem Inhalt, wobei Titel ein kurzer Phasenname ist. Gib bei einem ' +
    'einfachen Workout ohne sinnvolle Phasen einfach nur das Workout ohne solche ' +
    'Trennzeilen zurück. Halte dich kurz.',
} as const

export interface Phase {
  title: string
  content: string
}

const PHASE_MARKER = /^\s*={2,}\s*(.+?)\s*={2,}\s*$/

// Splittet den Rohtext an Marker-Zeilen "=== Titel ===". Ohne Marker entsteht
// genau eine Phase mit leerem Titel. Leere Phasen werden verworfen.
export function parsePhases(raw: string): Phase[] {
  const phases: Phase[] = []
  let current: { title: string; lines: string[] } | null = null
  const flush = () => {
    if (!current) return
    const content = current.lines.join('\n').trim()
    if (content) phases.push({ title: current.title, content })
    current = null
  }
  for (const line of raw.split('\n')) {
    const m = PHASE_MARKER.exec(line)
    // Titel muss echte Zeichen enthalten, sonst ist es eine reine Trennlinie (z. B. ======)
    if (m && /[^\s=]/.test(m[1])) {
      flush()
      current = { title: m[1].trim(), lines: [] }
    } else {
      if (!current) current = { title: '', lines: [] }
      current.lines.push(line)
    }
  }
  flush()
  return phases
}

export interface GenerateDeps {
  rateLimiter: RateLimiter
  globalBudget: RateLimiter
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
  // Erst pro-IP, dann global: eine per-IP abgewiesene Flut darf das Gesamtbudget
  // nicht für alle anderen aufzehren (Circuit Breaker, Befund 2).
  if (!deps.globalBudget.allow(GLOBAL_BUDGET_KEY)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt || prompt.length > GENERATE_CONFIG.maxPromptChars) {
    return { status: 400, body: { error: 'Ungültiger Wunsch-Text.' } }
  }
  try {
    const raw = await deps.generateWorkout(prompt)
    return { status: 200, body: { phases: parsePhases(raw) } }
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
