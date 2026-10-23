/** Inline live PLC trend driven by the existing session-authorized job stream. */
import { useEffect, useState } from 'react'
import type { TrendJobRemote } from './types.ts'
import { trendPoint, trendReceipt, trendSegments, type TrendPoint } from './trend-model.ts'

/** Narrow owner/injected props supplied by the keyed tool seat. */
export interface TrendCardProps {
  phase: string
  block: { content?: unknown; isError?: boolean }
  trendJobs?: TrendJobRemote | undefined
  t(key: string): string
}

/** Display a live watch and stop it without cancelling the chat. @param props - Tool seat and existing job Remote. @returns Trend card. */
export function TrendCard({ phase, block, trendJobs, t }: TrendCardProps) {
  const receipt = phase === 'result' ? trendReceipt(block.content) : undefined
  const [points, setPoints] = useState<TrendPoint[]>([])
  const [state, setState] = useState('trend.connecting')
  const [stopping, setStopping] = useState(false)
  useEffect(() => {
    if (!receipt || !trendJobs) return
    const abort = new AbortController()
    let pending: TrendPoint[] = []; let dirty = false; let tail = ''
    const flush = () => { if (!dirty || abort.signal.aborted) return; dirty = false; setPoints([...pending]) }
    const timer = setInterval(flush, receipt.refresh)
    const run = async () => {
      try {
        for await (const frame of trendJobs.follow({ jobId: receipt.jobId, sessionId: receipt.sessionId }, abort.signal)) {
          if (abort.signal.aborted) return
          if (!frame || typeof frame !== 'object' || !('type' in frame)) throw new Error('Invalid job frame')
          if (frame.type === 'opened') setState('trend.running')
          if (frame.type === 'output' && 'chunks' in frame && Array.isArray(frame.chunks)) {
            if ('lossy' in frame && frame.lossy === true) { pending = []; tail = ''; setState('trend.gap') }
            for (const chunk of frame.chunks) {
              if (!chunk || typeof chunk !== 'object' || typeof chunk.text !== 'string') throw new Error('Invalid trend output')
              if (chunk.gapBefore === true) { pending = []; tail = ''; setState('trend.gap') }
              tail += chunk.text
              const lines = tail.split('\n'); tail = lines.pop() ?? ''
              for (const line of lines) {
                const point = trendPoint(line)
                if (point) { pending.push(point); if (pending.length > receipt.maxSamples) pending.shift(); dirty = true }
              }
            }
          }
          if (frame.type === 'status' && 'job' in frame && frame.job && typeof frame.job === 'object' && 'status' in frame.job) {
            flush(); setState(frame.job.status === 'completed' ? 'trend.completed' : frame.job.status === 'killed' ? 'trend.stopped' : 'trend.failed')
          }
        }
      } catch (error) { if (!abort.signal.aborted) { void error; setState('trend.unavailable') } }
      finally { clearInterval(timer); flush() }
    }
    void run()
    return () => { abort.abort(); clearInterval(timer) }
  }, [receipt?.jobId, receipt?.sessionId, receipt?.refresh, receipt?.maxSamples, trendJobs])
  if (!receipt) return <div role="status">{t(block.isError ? 'trend.failed' : 'trend.connecting')}</div>
  const tags = [...new Set(points.flatMap(point => point.values.map(value => value.tag)))]
  const stop = async () => {
    if (!trendJobs || stopping) return
    setStopping(true)
    try {
      const result = await trendJobs.kill({ jobId: receipt.jobId, sessionId: receipt.sessionId })
      if (!result.ok) setState('trend.stopFailed')
    } catch (error) { void error; setState('trend.stopFailed') }
    finally { setStopping(false) }
  }
  return <section aria-label={t('trend.title')} style={{ padding: '12px', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: '8px' }}>
    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
      <span>{t('trend.title')}</span><span role="status">{t(trendJobs ? state : 'trend.unavailable')}</span>
      <button type="button" style={{ color: 'var(--dsw-alias-label-primary)', background: 'transparent', border: '1px solid var(--dsw-alias-border-l3)', borderRadius: '6px', font: 'inherit', padding: '4px 10px' }} disabled={!trendJobs || stopping || ['trend.completed', 'trend.stopped', 'trend.failed'].includes(state)} onClick={() => { void stop() }}>{t('trend.stop')}</button>
    </div>
    <p>{t('trend.interval')}: {receipt.interval} ms · {t('trend.samples')}: {points.length}</p>
    {points.length > 1 && <p>{t('trend.actualInterval')}: {((points.at(-1)!.elapsed - points[0]!.elapsed) / (points.length - 1)).toFixed(1)} ms · {t('trend.overruns')}: {points.filter(point => point.overrun === true).length}</p>}
    {tags.map(tag => {
      const plot = trendSegments(points, tag)
      const latest = points.at(-1)?.values.find(value => value.tag === tag)
      return <figure key={tag} style={{ margin: '12px 0' }}><figcaption>{tag} · {latest?.quality === 'good' ? String(latest.value) : t('trend.badValue')} · {plot.min}–{plot.max}</figcaption>
        <svg viewBox="0 0 600 110" role="img" aria-label={tag} style={{ width: '100%', height: '110px' }}>
          {plot.segments.map((segment, index) => <polyline key={index} points={segment} fill="none" stroke="currentColor" strokeWidth="1.5" />)}
        </svg>
        <small>{((points[0]?.elapsed ?? 0) / 1000).toFixed(2)}–{((points.at(-1)?.elapsed ?? 0) / 1000).toFixed(2)} s</small>
      </figure>
    })}
    <small>{t('trend.source')}: {receipt.sourceHash.slice(0, 12)} · {t('trend.limitation')}</small>
  </section>
}
