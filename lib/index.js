/**
 * Host half of the engineering bundle.
 *
 * The bundle's work happens in its patch (`cordis.patch.yml`: the tool policy
 * and the product rows), in its client face (`./client`) and in its Typert
 * host face (`./typert`). This entry exists because a client bundle is
 * discovered through a *mounted* package row, and a row mounts a package root;
 * it provides the `ecad` Remote service the package's `./typert`
 * invocation names, and writes one marker file per call so the client-to-Host
 * path can be verified without a debugger.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'

/** Cordis service key, and Remote namespace, of the bundle's probe service. */
export const ECAD_SERVICE = "ecad"
/** Remote endpoint the ./typert artifact registers for this service. */
export const ECAD_ENDPOINT = "ecad/ping"

/**
 * Write the invariant Host-side marker for one probe call.
 *
 * `ECAD_SPIKE_DIR` lets a test boot pin the location; otherwise the system temp
 * directory holds a fresh `pong-<epoch>-<pid>.json` per call.
 * @param payload - the client payload, recorded verbatim.
 * @param descriptors - which descriptor kind dispatched the call.
 * @returns the marker path and its timestamp.
 */
function writeMarker(payload, descriptors) {
  const directory = process.env.ECAD_SPIKE_DIR ?? join(process.env.TEMP ?? homedir(), 'ecad-typert-spike')
  mkdirSync(directory, { recursive: true })
  const at = new Date().toISOString()
  const marker = join(directory, `pong-${Date.now()}-${process.pid}.json`)
  writeFileSync(marker, JSON.stringify({
    ok: true,
    service: ECAD_SERVICE,
    endpoint: ECAD_ENDPOINT,
    descriptor: descriptors,
    received: payload,
    at,
    pid: process.pid,
  }, null, 2) + '\n')
  return { marker, at }
}

/**
 * Register the `ecad` Cordis service.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  const service = {
    /**
     * Echo the client payload and record the Host-side marker.
     * @param payload - the JSON object the client sent.
     * @returns the marker path, the dispatch kind and the echoed payload.
     */
    ping(payload) {
      const strict = ctx.get('typert')?.local.get(ECAD_ENDPOINT) !== undefined
      const { marker, at } = writeMarker(payload, strict ? 'strict' : 'src')
      ctx.logger.info(`[ecad-typert-spike] ${ECAD_ENDPOINT} dispatched via ${strict ? 'strict' : 'src'} descriptor: ${marker}`)
      return { ok: true, echo: payload, at, marker, descriptor: strict ? 'strict' : 'src' }
    },
  }
  // Explicit Service-to-Gateway binding: the Gateway refuses to dispatch to a
  // service without this visible binding, whether the descriptor came from the
  // ./typert artifact or from its source-mode fallback.
  service.typertRemote = bindTypertRemote(service, ECAD_SERVICE)
  ctx.provide(ECAD_SERVICE, service)
}
