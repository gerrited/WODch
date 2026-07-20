export interface RateLimiter {
  allow(key: string): boolean
}

// Fester Schlüssel für das globale KI-Budget (Circuit Breaker über alle IPs —
// SECURITY_REVIEW Befund 2).
export const GLOBAL_BUDGET_KEY = '__global__'

// Gleitendes Zeitfenster pro Schlüssel. Timestamps werden faul beim Zugriff bereinigt.
export function createRateLimiter(
  limit: number,
  windowMs: number,
  now: () => number = Date.now,
): RateLimiter {
  const hits = new Map<string, number[]>()
  return {
    allow(key: string): boolean {
      const t = now()
      const cutoff = t - windowMs
      const recent = (hits.get(key) ?? []).filter((ts) => ts > cutoff)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      return true
    },
  }
}
