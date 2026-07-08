// Bestimmt aus der Scroll-Position des Snap-Containers den aktiven Tab-Index
export function activeIndexFromScroll(scrollLeft: number, viewportWidth: number, count: number): number {
  if (viewportWidth <= 0) return 0
  const index = Math.round(scrollLeft / viewportWidth)
  return Math.max(0, Math.min(count - 1, index))
}
