/**
 * Read controller tags for a live display preview.
 *
 * The preview asks for the controller tags an HMI tag maps to (the export's
 * `Address` column), and this module reads them with the same EtherNet/IP driver
 * the L5X live row uses. It is read-only: no writes, no forcing, no session
 * state on the controller. Every failure is reported per tag rather than
 * substituted with a value, because a preview must never show invented data.
 *
 * @module dsh-engineering-ftview/live-read
 */

/** One tag read result. */
export interface LiveValue {
  /** The value the controller returned. */
  readonly value?: string | number | boolean
  /** `good` when read, `bad` when the read failed. */
  readonly quality: 'good' | 'bad'
  /** Why the read failed, when it did. */
  readonly error?: string
}

/** One read sweep. */
export interface LiveRead {
  /** Values keyed by controller tag name. */
  readonly values: Readonly<Record<string, LiveValue>>
  /** Controller identity, when the driver reported it. */
  readonly controller?: { readonly product_name?: string; readonly revision?: string }
  /** ISO timestamp of the sweep. */
  readonly read_at: string
}

/** Performs one read sweep; injectable for tests. */
export type LiveReader = (ip: string, slot: number, tags: readonly string[], timeoutMs: number) => Promise<LiveRead>

/** A tag name the driver accepts. */
export const TAG_NAME = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u

/** Read tags with `st-ethernet-ip`, the driver the L5X live row already uses. */
export const readFromController: LiveReader = async (ip, slot, tags, timeoutMs) => {
  const ethernetIp = (await import('st-ethernet-ip')).default as unknown as {
    Controller: new (discovery: boolean) => {
      timeout_sp: number
      properties?: { name?: string; version?: string }
      connect(ip: string, slot: number, autoConnect?: boolean): Promise<void>
      readControllerProps?: () => Promise<void>
      readTag(tag: unknown): Promise<void>
      disconnect?: () => Promise<void>
      on(event: string, listener: (error: unknown) => void): void
    }
    Tag: new (name: string, program?: string) => { value?: unknown }
  }
  const plc = new ethernetIp.Controller(false)
  plc.timeout_sp = timeoutMs
  plc.on('error', () => { /* transport errors are reported per tag below */ })
  const values: Record<string, LiveValue> = {}
  try {
    await plc.connect(ip, slot, false)
    await plc.readControllerProps?.()
    for (const name of tags) {
      const tag = new ethernetIp.Tag(name)
      try {
        await plc.readTag(tag)
        const value = tag.value as string | number | boolean | undefined
        values[name] = value === undefined ? { quality: 'bad', error: 'the driver returned no value' } : { quality: 'good', value }
      } catch (error) {
        values[name] = { quality: 'bad', error: error instanceof Error ? error.message : String(error) }
      }
    }
  } finally {
    await plc.disconnect?.().catch(() => undefined)
  }
  return {
    values,
    ...(plc.properties === undefined ? {} : {
      controller: { product_name: plc.properties.name, revision: plc.properties.version },
    }),
    read_at: new Date().toISOString(),
  }
}
