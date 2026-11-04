/**
 * Host half of the engineering bundle.
 *
 * The bundle's work happens in its patch (`cordis.patch.yml`), its client face
 * (`./client`) and its Typert host face (`./typert`). A client bundle is
 * discovered through a *mounted* package row, and a row mounts a package root;
 * this entry registers the `ecad` Remote service the
 * package's `./typert` invocations name, and the client face reaches it through
 * `ctx.remote.ecad`.
 */
import { createEcadService } from '../src/remote/ecad-service.js'

/** Cordis service key, and Remote namespace, of the bundle's ECAD service. */
export const ECAD_SERVICE = "ecad"
/** Every Remote endpoint the package's `./typert` artifact registers for that service. */
export const ECAD_ENDPOINTS = ["ecad/open","ecad/apply","ecad/sheets","ecad/capabilities"]

/**
 * Register the ECAD Remote service; the Gateway binding is applied inside.
 * @param ctx - Host plugin context.
 */
export function apply(ctx) {
  createEcadService(ctx)
}
