import Anthropic from '@anthropic-ai/sdk'
import type { RateLimiter } from './rateLimit.js'

export const ESTIMATE_CONFIG = {
  model: 'claude-haiku-4-5',
  maxTokens: 400,
  maxPromptChars: 2000,
  systemPrompt:
    'Du bist ein erfahrener CrossFit- und Gym-Coach. Der Nutzer gibt dir ein Workout, das ' +
    'er in benannte Abschnitte (Tabs, z. B. Warmup, MetCon, Cooldown) aufgeteilt haben kann. ' +
    'Schätze die realistische Gesamtdauer in Minuten. Gib ausschließlich striktes JSON im ' +
    'Schema {"totalMinutes": number, "segments": [{"label": string, "minutes": number}]} ' +
    'zurück — keine Einleitung, keine Markdown-Fences, keine Erklärung. Erzeuge bevorzugt ' +
    'einen Abschnitt pro Tab und nutze den Tab-Titel als Label. Labels kurz und auf Deutsch. ' +
    'segments darf leer sein, wenn keine klaren Phasen erkennbar sind.',
} as const

export interface EstimateTab {
  title: string
  content: string
}

export interface DurationSegment {
  label: string
  minutes: number
}

export interface DurationEstimate {
  totalMinutes: number
  segments: DurationSegment[]
}

export interface EstimateDeps {
  rateLimiter: RateLimiter
  hasApiKey: () => boolean
  estimateDuration: (tabs: EstimateTab[]) => Promise<DurationEstimate>
}

export interface EstimateResult {
  status: number
  body: object
}

// Validiert das rohe tabs-Feld und filtert leere Inhalte. null = ungültige Struktur.
function validateTabs(input: unknown): EstimateTab[] | null {
  if (!Array.isArray(input)) return null
  const tabs: EstimateTab[] = []
  for (const t of input) {
    if (typeof t !== 'object' || t === null) return null
    const o = t as Record<string, unknown>
    if (typeof o.title !== 'string' || typeof o.content !== 'string') return null
    if (o.content.trim() === '') continue
    tabs.push({ title: o.title, content: o.content })
  }
  return tabs
}

export async function handleEstimate(
  input: { tabs: unknown; ip: string },
  deps: EstimateDeps,
): Promise<EstimateResult> {
  if (!deps.hasApiKey()) {
    return { status: 503, body: { error: 'Schätzung ist nicht konfiguriert.' } }
  }
  if (!deps.rateLimiter.allow(input.ip)) {
    return { status: 429, body: { error: 'Zu viele Anfragen. Bitte kurz warten.' } }
  }
  const tabs = validateTabs(input.tabs)
  const combined = tabs?.reduce((n, t) => n + t.content.length, 0) ?? 0
  if (!tabs || tabs.length === 0 || combined > ESTIMATE_CONFIG.maxPromptChars) {
    return { status: 400, body: { error: 'Ungültiger Workout-Text.' } }
  }
  try {
    const estimate = await deps.estimateDuration(tabs)
    return { status: 200, body: { estimate } }
  } catch {
    return { status: 500, body: { error: 'Schätzung fehlgeschlagen.' } }
  }
}

export function buildPrompt(tabs: EstimateTab[]): string {
  return tabs.map((t) => `## ${t.title}\n${t.content}`).join('\n\n')
}

// Entfernt umschließende ```-Code-Fences (optional mit Sprach-Angabe).
export function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```[^\n]*\n?/, '')
    .replace(/\n?```\s*$/, '')
    .trim()
}

export function parseEstimate(raw: unknown): DurationEstimate {
  if (typeof raw !== 'object' || raw === null) throw new Error('Kein Objekt')
  const o = raw as Record<string, unknown>
  if (typeof o.totalMinutes !== 'number' || !Number.isFinite(o.totalMinutes) || o.totalMinutes <= 0) {
    throw new Error('totalMinutes ungültig')
  }
  if (!Array.isArray(o.segments)) throw new Error('segments ungültig')
  const segments = o.segments.map((s): DurationSegment => {
    if (typeof s !== 'object' || s === null) throw new Error('Segment ungültig')
    const seg = s as Record<string, unknown>
    if (typeof seg.label !== 'string' || seg.label.trim() === '') throw new Error('label ungültig')
    if (typeof seg.minutes !== 'number' || !Number.isFinite(seg.minutes) || seg.minutes < 0) {
      throw new Error('minutes ungültig')
    }
    return { label: seg.label, minutes: seg.minutes }
  })
  return { totalMinutes: o.totalMinutes, segments }
}

// Dünner SDK-Wrapper — bewusst nicht unit-getestet (kein Live-Call in Tests).
export async function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate> {
  const client = new Anthropic()
  const response = await client.messages.create({
    model: ESTIMATE_CONFIG.model,
    max_tokens: ESTIMATE_CONFIG.maxTokens,
    system: ESTIMATE_CONFIG.systemPrompt,
    messages: [{ role: 'user', content: buildPrompt(tabs) }],
  })
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
  return parseEstimate(JSON.parse(stripCodeFences(text)))
}
