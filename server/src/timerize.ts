import Anthropic from '@anthropic-ai/sdk'
import { GLOBAL_BUDGET_KEY, type RateLimiter } from './rateLimit.js'
import { stripCodeFences } from './estimate.js'

export const TIMERIZE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 300,
  maxPromptChars: 2000,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Der Nutzer gibt dir ein Workout. Leite ' +
    'daraus die passende Timer-Einstellung für das Haupt-Workout ab. Gib ausschließlich striktes ' +
    'JSON zurück — keine Einleitung, keine Markdown-Fences, keine Erklärung — in genau einer ' +
    'dieser Formen:\n' +
    '{"mode":"interval","workSeconds":number,"restSeconds":number,"rounds":number,"label":string} ' +
    'für EMOM/E2MOM, Tabata und Intervalle (EMOM: restSeconds 0, workSeconds = Intervall-Länge);\n' +
    '{"mode":"countdown","seconds":number,"label":string} für AMRAP und Workouts mit Zeitlimit ' +
    '(Time Cap);\n' +
    '{"mode":"countup","label":string} für "For Time" ohne Zeitlimit;\n' +
    '{"mode":"none"} wenn sich kein sinnvoller Timer ableiten lässt.\n' +
    'label ist eine sehr kurze deutsche Beschreibung (z. B. "EMOM 12 Min", "AMRAP 20 Min").',
} as const

// Grenzen wie im Timer-Modal: Minuten-Felder gehen bis 99, Runden bis 99.
export const TIMERIZE_LIMITS = {
  maxSeconds: 99 * 60 + 59,
  maxRounds: 99,
  maxLabelChars: 60,
} as const

export type TimerSuggestion =
  | { mode: 'interval'; workSeconds: number; restSeconds: number; rounds: number; label: string }
  | { mode: 'countdown'; seconds: number; label: string }
  | { mode: 'countup'; label: string }

export interface TimerizeDeps {
  rateLimiter: RateLimiter
  globalBudget: RateLimiter
  hasApiKey: () => boolean
  // null = Modell sieht keinen sinnvollen Timer im Workout
  suggestTimer: (content: string) => Promise<TimerSuggestion | null>
}

export interface TimerizeResult {
  status: number
  body: { timer: TimerSuggestion } | { error: string }
}

export async function handleTimerize(
  input: { content: unknown; ip: string },
  deps: TimerizeDeps,
): Promise<TimerizeResult> {
  if (!deps.hasApiKey()) {
    return { status: 503, body: { error: 'Timer-Vorschlag ist nicht konfiguriert.' } }
  }
  if (!deps.rateLimiter.allow(input.ip)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  // Erst pro-IP, dann global (Circuit Breaker, Befund 2) — wie bei /generate und /estimate.
  if (!deps.globalBudget.allow(GLOBAL_BUDGET_KEY)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  const content = typeof input.content === 'string' ? input.content.trim() : ''
  if (!content || content.length > TIMERIZE_CONFIG.maxPromptChars) {
    return { status: 400, body: { error: 'Ungültiger Workout-Text.' } }
  }
  try {
    const timer = await deps.suggestTimer(content)
    if (!timer) return { status: 422, body: { error: 'Kein passender Timer erkennbar.' } }
    return { status: 200, body: { timer } }
  } catch {
    return { status: 500, body: { error: 'Timer-Vorschlag fehlgeschlagen.' } }
  }
}

function seconds(v: unknown, min: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('Sekunden ungültig')
  const s = Math.round(v)
  if (s < min || s > TIMERIZE_LIMITS.maxSeconds) throw new Error('Sekunden außerhalb der Grenzen')
  return s
}

function label(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, TIMERIZE_LIMITS.maxLabelChars) : ''
}

// Modell-Ausgabe ist untrusted: jedes Feld prüfen und auf die Modal-Grenzen klemmen
// bzw. verwerfen, damit der Client nur Werte bekommt, die er selbst einstellen könnte.
export function parseTimerSuggestion(raw: unknown): TimerSuggestion | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Kein Objekt')
  const o = raw as Record<string, unknown>
  if (o.mode === 'none') return null
  if (o.mode === 'countup') return { mode: 'countup', label: label(o.label) }
  if (o.mode === 'countdown') return { mode: 'countdown', seconds: seconds(o.seconds, 1), label: label(o.label) }
  if (o.mode === 'interval') {
    const r = o.rounds
    if (typeof r !== 'number' || !Number.isInteger(r) || r < 1 || r > TIMERIZE_LIMITS.maxRounds) {
      throw new Error('rounds ungültig')
    }
    return {
      mode: 'interval',
      workSeconds: seconds(o.workSeconds, 1),
      restSeconds: seconds(o.restSeconds, 0),
      rounds: r,
      label: label(o.label),
    }
  }
  throw new Error('mode ungültig')
}

// Dünner SDK-Wrapper — bewusst nicht unit-getestet (kein Live-Call in Tests).
export async function suggestTimer(content: string): Promise<TimerSuggestion | null> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: TIMERIZE_CONFIG.model,
    max_tokens: TIMERIZE_CONFIG.maxTokens,
    // Deterministisch: dasselbe Workout soll denselben Timer ergeben.
    temperature: 0,
    system: TIMERIZE_CONFIG.systemPrompt,
    messages: [{ role: 'user', content }],
  })
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return parseTimerSuggestion(JSON.parse(stripCodeFences(text)))
}
