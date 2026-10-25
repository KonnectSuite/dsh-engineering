/** Isolated one-shot EtherNet/IP transactions. The parent owns deadlines, approval and validation. */
import { isMainThread, parentPort, workerData } from 'node:worker_threads'
import { setTimeout as delay } from 'node:timers/promises'
import ethernetIp from 'st-ethernet-ip'
import { isIPv4 } from 'node:net'

/** Shape one tag address for output. */
function addressOf(entry) {
  return entry.program === undefined ? entry.name : `Program:${entry.program}.${entry.name}`
}

/** One observed value, quality included. */
function readValue(entry, tag) {
  const typeMatches = tag.type === entry.data_type
  const scalar = typeof tag.value === 'boolean' || (typeof tag.value === 'number' && Number.isFinite(tag.value))
  return {
    tag: addressOf(entry),
    data_type: entry.data_type,
    actual_data_type: tag.type,
    value: typeMatches && scalar ? tag.value : null,
    quality: typeMatches && scalar ? 'good' : 'bad',
    ...typeMatches && scalar ? {} : { error: 'Live type or value differs from the export declaration' },
  }
}

/**
 * Open a controller, run one operation, and always close the connection.
 *
 * @param {object} spec Validated worker request.
 * @returns {Promise<object>} The operation's result value.
 */
async function connectAndRun(spec, run) {
  if (!spec || typeof spec.ip !== 'string' || !isIPv4(spec.ip) || !Number.isInteger(spec.slot) || spec.slot < 0 || spec.slot > 31
    || !Number.isInteger(spec.timeout) || spec.timeout < 1)
    throw new Error('Invalid CIP worker request')
  const plc = new ethernetIp.Controller(false)
  plc.timeout_sp = spec.timeout
  // Driver transport failures are reported per request; keep the socket event handled.
  plc.on('error', error => { void error })
  try {
    await plc.connect(spec.ip, spec.slot, false)
    await plc.readControllerProps()
    const controller = {
      product_name: plc.properties.name,
      serial_number: plc.properties.serial_number,
      revision: plc.properties.version,
      status: plc.properties.status,
    }
    return await run(plc, controller)
  } finally {
    // Unconnected explicit messaging needs no Forward Close request.
    const closed = new Promise(resolve => plc.once('close', resolve))
    if (!plc.closed) { if (!plc.destroyed) plc.destroy(); await closed }
  }
}

/** Batch read: one explicit request carries every tag in the group. */
async function read(spec) {
  return await connectAndRun(spec, async (plc, controller) => {
    const group = new ethernetIp.TagGroup()
    const tags = spec.tags.map(entry => {
      if (!entry || typeof entry.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.name)
        || !['BOOL', 'INT', 'DINT', 'REAL'].includes(entry.data_type)
        || (entry.program !== undefined && (typeof entry.program !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.program))))
        throw new Error('Invalid CIP worker tag')
      const tag = new ethernetIp.Tag(entry.name, entry.program)
      group.add(tag)
      return { entry, tag }
    })
    await plc.readTagGroup(group)
    return {
      controller,
      request_count: 1,
      observed_at: new Date().toISOString(),
      values: tags.map(({ entry, tag }) => ({ ...readValue(entry, tag), observed_at: new Date().toISOString() })),
    }
  })
}

/** Identity and wall clock; the clock exists only on L8x controllers. */
async function clock(spec) {
  return await connectAndRun(spec, async (plc, controller) => {
    try {
      await plc.readWallClock()
      return {
        controller,
        supported: true,
        controller_time: plc.properties.time instanceof Date ? plc.properties.time.toISOString() : String(plc.properties.time),
        host_time: new Date().toISOString(),
      }
    } catch (error) {
      return {
        controller,
        supported: false,
        host_time: new Date().toISOString(),
        reason: error instanceof Error ? error.message : 'Wall clock is unavailable on this controller',
      }
    }
  })
}

/** One tag write, read back over CIP so the result is the controller's answer. */
async function write(spec) {
  return await connectAndRun(spec, async (plc) => {
    const entry = spec.tag
    const tag = new ethernetIp.Tag(entry.name, entry.program)
    // Read first: the driver needs the controller's own type to encode the write.
    await plc.readTag(tag)
    const before = tag.value
    const actualType = tag.type
    tag.value = spec.value
    await plc.writeTag(tag)
    await plc.readTag(tag)
    const readback = tag.value
    return {
      tag: addressOf(entry),
      declared_data_type: entry.data_type,
      actual_data_type: actualType,
      previous_value: before,
      requested_value: spec.value,
      readback,
      verified: Object.is(readback, spec.value) || (typeof readback === 'number' && typeof spec.value === 'number' && Math.abs(readback - spec.value) < 1e-6),
      written_at: new Date().toISOString(),
    }
  })
}

/** Set the wall clock; L8x only, and read back to prove it landed. */
async function writeClock(spec) {
  return await connectAndRun(spec, async (plc) => {
    const target = new Date(spec.iso)
    if (Number.isNaN(target.getTime())) throw new Error('Invalid wall clock timestamp')
    await plc.writeWallClock(target)
    await plc.readWallClock()
    const readback = plc.properties.time instanceof Date ? plc.properties.time.toISOString() : String(plc.properties.time)
    return { requested_time: target.toISOString(), readback, verified: Math.abs(Date.parse(readback) - target.getTime()) < 2000 }
  })
}

/** UDP broadcast discovery: where are the controllers on this LAN. */
async function discover(spec) {
  const browser = new ethernetIp.Browser()
  const devices = new Map()
  browser.on('Device List Updated', list => {
    for (const device of list) {
      const address = device?.socketAddress?.sin_addr
      if (typeof address === 'string') devices.set(address, device)
    }
  })
  browser.on('error', error => { void error })
  try {
    browser.start()
    await delay(spec.duration)
  } finally {
    browser.stop()
  }
  return {
    seconds: spec.duration / 1000,
    devices: [...devices.entries()].map(([ip, device]) => ({
      ip_address: ip,
      product_name: String(device.productName ?? ''),
      revision: String(device.revision ?? ''),
      serial_number: String(device.serialNumber ?? ''),
      vendor_id: Number(device.vendorID ?? 0),
      device_type: Number(device.deviceType ?? 0),
      status: Number(device.status ?? 0),
    })),
  }
}

const OPERATIONS = { read, clock, write, 'write-clock': writeClock, discover }

if (!isMainThread) {
  try {
    const operation = OPERATIONS[workerData?.op]
    if (operation === undefined) throw new Error('Unknown CIP worker operation')
    parentPort.postMessage({ ok: true, value: await operation(workerData) })
  } catch (error) {
    parentPort.postMessage({ ok: false, message: error instanceof Error ? error.message : 'Controller transaction failed' })
  } finally { parentPort.close() }
}
