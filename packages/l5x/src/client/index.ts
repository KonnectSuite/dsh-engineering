/** Inline PLC trend tool view; data and cancellation use the existing job Remote. */
import type { ClientScope } from './types.ts'
import { en, NS, zh } from './locales.ts'
import { TrendCard } from './TrendCard.tsx'

/** Required client services; job availability is explained inside the card. */
export const inject = ['slots', 'locale', 'remote']

/** Register the live trend card without a Studio launcher sidebar. @param ctx - Browser service context. */
export function apply(ctx: ClientScope): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'l5x-live: trend copy')
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: 'start_plc_trend', locale: NS,
    inject: () => ({ trendJobs: ctx.remote.job }),
  }, TrendCard))
}
