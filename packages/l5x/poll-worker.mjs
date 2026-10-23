/** Isolated, read-only EtherNet/IP sampler. Parent owns deadlines and awaited termination. */
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { setTimeout as delay } from 'node:timers/promises'
import { performance } from 'node:perf_hooks'
import ethernetIp from 'st-ethernet-ip'
import { isIPv4 } from 'node:net'

/**
 * Sample explicit scalar tags without SDK discovery, subscriptions, or writes.
 * @param {object} spec Validated worker request.
 * @param {(frame: object) => void} emit Frame sink.
 * @returns {Promise<void>} Completion after connection cleanup.
 */
export async function collect(spec, emit) {
  if (!spec || typeof spec.ip !== 'string' || !isIPv4(spec.ip) || !Number.isInteger(spec.slot) || spec.slot < 0 || spec.slot > 31
    || !Array.isArray(spec.tags) || spec.tags.length < 1 || spec.tags.length > 256
    || !Number.isInteger(spec.samples) || spec.samples < 1 || spec.samples > 100000
    || !Number.isInteger(spec.interval) || spec.interval < 1
    || !Number.isInteger(spec.timeout) || spec.timeout < 1)
    throw new Error('Invalid polling worker request')
  const plc = new ethernetIp.Controller(false)
  plc.timeout_sp = spec.timeout
  // The worker lifetime bounds the driver's internal timers and sockets.
  plc.on('error', error => { void error /* Driver requests report transport failures; prevent an unhandled socket event. */ })
  try {
    await plc.connect(spec.ip, spec.slot, false)
    await plc.readControllerProps()
    emit({ type: 'identity', controller: {
      product_name: plc.properties.name, serial_number: plc.properties.serial_number,
      revision: plc.properties.version, status: plc.properties.status,
    } })
    const tags = spec.tags.map(entry => {
      if (!entry || typeof entry.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.name)
        || !['BOOL', 'INT', 'DINT', 'REAL'].includes(entry.data_type)
        || (entry.program !== undefined && (typeof entry.program !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.program))))
        throw new Error('Invalid polling worker tag')
      return { entry, tag: new ethernetIp.Tag(entry.name, entry.program) }
    })
    const started = performance.now()
    for (let index = 0; index < spec.samples; index++) {
      const sweepStart = performance.now()
      const values = []
      for (const { entry, tag } of tags) {
        try {
          await plc.readTag(tag)
          const value = tag.value
          const typeMatches = tag.type === entry.data_type
          const scalarMatches = entry.data_type === 'BOOL' ? typeof value === 'boolean'
            : typeof value === 'number' && Number.isFinite(value)
          values.push({ tag: entry.program ? `Program:${entry.program}.${entry.name}` : entry.name,
            data_type: entry.data_type, actual_data_type: tag.type,
            value: typeMatches && scalarMatches ? value : null,
            quality: typeMatches && scalarMatches ? 'good' : 'bad', observed_at: new Date().toISOString(),
            ...typeMatches && scalarMatches ? {} : { error: 'Live type or value differs from the export declaration' } })
        } catch (error) {
          values.push({ tag: entry.program ? `Program:${entry.program}.${entry.name}` : entry.name,
            data_type: entry.data_type, value: null, quality: 'bad', observed_at: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Tag read failed' })
        }
      }
      const sweepEnd = performance.now()
      emit({ type: 'sample', index, elapsed_ms: sweepStart - started, sweep_ms: sweepEnd - sweepStart,
        overrun: sweepEnd - sweepStart > spec.interval, values })
      if (index + 1 < spec.samples) await delay(Math.max(0, spec.interval - (performance.now() - sweepStart)))
    }
  } finally {
    // Unconnected explicit messaging needs no Forward Close request.
    const closed = new Promise(resolve => plc.once('close', resolve))
    if (!plc.closed) { if (!plc.destroyed) plc.destroy(); await closed }
  }
}

if (!isMainThread) {
  try { await collect(workerData, frame => parentPort.postMessage(frame)) }
  catch (error) { parentPort.postMessage({ type: 'failure', message: error instanceof Error ? error.message : 'Polling failed' }) }
  finally { parentPort.close() }
}
