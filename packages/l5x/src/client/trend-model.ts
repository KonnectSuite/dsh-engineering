/** Bounded, gap-preserving plot data from the authenticated job stream. */
export interface TrendPoint { elapsed: number; overrun: boolean | undefined; values: { tag: string; value: number | boolean | null; quality: string }[] }
/** Start receipt persisted in the tool result. */
export interface TrendReceipt { jobId: string; sessionId: string; interval: number; sourceHash: string; refresh: number; maxSamples: number }

/** Parse a recorded start receipt. @param content - Logged tool content. @returns Valid receipt or undefined. */
export function trendReceipt(content: unknown): TrendReceipt | undefined {
  if (!Array.isArray(content)) return undefined
  for (const entry of content) {
    if (!entry || typeof entry !== 'object' || entry.type !== 'text' || typeof entry.text !== 'string') continue
    try {
      const value: unknown = JSON.parse(entry.text)
      if (value && typeof value === 'object' && 'view' in value && value.view === 'plc-trend'
        && 'job_id' in value && typeof value.job_id === 'string' && /^plc-trend-\d+$/u.test(value.job_id)
        && 'owner_session_id' in value && typeof value.owner_session_id === 'string'
        && 'requested_interval_ms' in value && typeof value.requested_interval_ms === 'number'
        && 'source_sha256' in value && typeof value.source_sha256 === 'string'
        && 'display_refresh_ms' in value && typeof value.display_refresh_ms === 'number' && value.display_refresh_ms >= 50 && value.display_refresh_ms <= 10000
        && 'display_max_samples' in value && typeof value.display_max_samples === 'number' && value.display_max_samples >= 2 && value.display_max_samples <= 20000)
        return { jobId: value.job_id, sessionId: value.owner_session_id, interval: value.requested_interval_ms, sourceHash: value.source_sha256,
          refresh: value.display_refresh_ms, maxSamples: value.display_max_samples }
    } catch (error) { void error /* Failed tool output is rendered as a state, not plot data. */ }
  }
  return undefined
}

/** Parse one sampler line. @param line - Retained job output. @returns Plot point or undefined for other frames. */
export function trendPoint(line: string): TrendPoint | undefined {
  const value: unknown = JSON.parse(line)
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'sample') return undefined
  if (!('elapsed_ms' in value) || typeof value.elapsed_ms !== 'number' || !Number.isFinite(value.elapsed_ms)
    || !('values' in value) || !Array.isArray(value.values)) throw new Error('Invalid trend sample')
  const values = value.values.map((item: unknown) => {
    if (!item || typeof item !== 'object' || !('tag' in item) || typeof item.tag !== 'string'
      || !('quality' in item) || typeof item.quality !== 'string' || !('value' in item)
      || !(item.value === null || typeof item.value === 'boolean' || typeof item.value === 'number' && Number.isFinite(item.value)))
      throw new Error('Invalid trend value')
    return { tag: item.tag, quality: item.quality, value: item.value }
  })
  return { elapsed: value.elapsed_ms, overrun: 'overrun' in value && typeof value.overrun === 'boolean' ? value.overrun : undefined, values }
}

/** Build distinct line segments so bad samples do not imply continuity. @param points - Retained samples. @param tag - Scoped tag. @returns SVG line segments and range. */
export function trendSegments(points: readonly TrendPoint[], tag: string) {
  const finite = points.flatMap(point => point.values.filter(item => item.tag === tag && item.quality === 'good' && item.value !== null).map(item => Number(item.value)))
  const min = Math.min(0, ...finite); const max = Math.max(1, ...finite)
  const start = points[0]?.elapsed ?? 0; const duration = Math.max(1, (points.at(-1)?.elapsed ?? start) - start)
  const segments: string[] = []; let current: string[] = []
  for (const point of points) {
    const value = point.values.find(item => item.tag === tag)
    if (!value || value.quality !== 'good' || value.value === null) {
      if (current.length) segments.push(current.join(' ')); current = []; continue
    }
    const x = 10 + (point.elapsed - start) / duration * 580
    const y = 100 - (Number(value.value) - min) / (max - min) * 90
    if (typeof value.value === 'boolean' && current.length) current.push(`${x},${current.at(-1)?.split(',')[1]}`)
    current.push(`${x},${y}`)
  }
  if (current.length) segments.push(current.join(' '))
  return { segments, min, max }
}
