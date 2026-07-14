export const PHRASES = [
  'Heavy lifting',
  'Chalking up',
  'Counting reps',
  'Racking plates',
  'Catching breath',
  'Programming WOD',
]

export function nextPhraseIndex(current: number): number {
  return (current + 1) % PHRASES.length
}

export interface Phase {
  title: string
  content: string
}

export async function requestWorkout(prompt: string): Promise<Phase[]> {
  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  let data: { phases?: { title?: string; content?: string }[]; error?: string } = {}
  try {
    data = await res.json()
  } catch {
    // Body leer/kein JSON — fällt unten auf Default-Fehler zurück
  }
  if (!res.ok || !Array.isArray(data.phases) || data.phases.length === 0) {
    throw new Error(data.error ?? 'Generierung fehlgeschlagen.')
  }
  return data.phases.map((p) => ({
    title: typeof p.title === 'string' ? p.title : '',
    content: formatWorkout(p.content ?? ''),
  }))
}

// Entfernt umschließende ```-Code-Fences und rahmt den Text mit je zwei
// Leerzeilen vor und nach dem Workout.
export function formatWorkout(raw: string): string {
  let text = raw.trim()
  // Öffnendes ``` (optional mit Sprach-Angabe) und schließendes ``` entfernen
  text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
  text = text.trim()
  return `\n\n${text}\n\n`
}
