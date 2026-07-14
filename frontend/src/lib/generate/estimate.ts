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

export async function estimateDuration(tabs: EstimateTab[]): Promise<DurationEstimate> {
  const res = await fetch('/estimate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tabs }),
  })
  let data: { estimate?: DurationEstimate; error?: string } = {}
  try {
    data = await res.json()
  } catch {
    // Body leer/kein JSON — fällt unten auf Default-Fehler zurück
  }
  if (!res.ok || !data.estimate) {
    throw new Error(data.error ?? 'Schätzung fehlgeschlagen.')
  }
  return data.estimate
}
