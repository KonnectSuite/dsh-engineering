/**
 * Skill-gated tool admission for the engineering rows.
 *
 * A row that mounts on a fresh install used to cost every request: the host
 * sends the name, description and parameter schema of each registered tool, so
 * the bundle's 199 tools were ~132k characters of context before the user asked
 * for anything. The schemas only earn their place once the work matches, and the
 * skill that carries the method is already in the catalog.
 *
 * The host's tool registry takes a per-step condition — `register(definition,
 * { when })` — evaluated once for each model step; a false answer keeps the tool
 * out of that step's request: no schema, no PTC binding, no dispatch. So each row
 * registers its tools exactly as before and this module supplies the condition:
 * a component's tools are visible to an agent once it has loaded a skill whose
 * body names one of them.
 *
 * Two observations arm the gate, because a skill can arrive two ways:
 *
 * - the `skill` tool result (`tools/result`), the model-invoked path, and
 * - the `skill-invocation` message the host appends for the user's `/name`
 *   gesture (`session/event`), which carries the same rendering as instructions.
 *
 * The loop resolves a step's tool set before any pre-step listener runs, so a
 * mark made during step N first shows up in step N+1. That is the same step the
 * model needs: it loads the skill, and its next step calls the tool.
 *
 * Recovery keeps the surface a session was already using. A resumed session's
 * request header carries the tool schemas the step declared, so a fresh process
 * (or a fork, or a PTC agent whose header only names `run_code`) sees the
 * component again without reloading the skill.
 *
 * A harness older than the condition ignores the second `register` argument and
 * sends every schema: the rows still work, they just cost what they used to.
 *
 * @module engineering-activation
 */

/**
 * Which skills reveal which component.
 *
 * A component is revealed by a skill when that skill's body names one of the
 * component's tools in its instructions — that is the only flow that has to keep
 * working without a fresh skill load. `engineering-standards` names
 * `engineering_reference`, so every product that starts from the brief reveals
 * the resources row; the migration skill names three L5X tools, so loading it
 * also reveals L5X; `rslogix-500` hands off to `migration_assess`; and so on.
 *
 * `test/activation.spec.mjs` derives this table from `docs/reference/tools.json`
 * and the `SKILL.md` bodies, so prose that starts naming a new tool fails the
 * suite until the table follows.
 *
 * Order matters only for tools that match several prefixes; no shipped name does.
 *
 * @type {Readonly<Record<string, { prefixes: readonly string[], skills: readonly string[] }>>}
 */
export const COMPONENTS = Object.freeze({
  l5x: Object.freeze({
    prefixes: Object.freeze(['l5x_']),
    skills: Object.freeze(['rockwell-l5x', 'engineering-standards', 'legacy-to-logix-migration']),
  }),
  ftview: Object.freeze({
    prefixes: Object.freeze(['ftview_']),
    skills: Object.freeze(['factorytalk-view', 'engineering-standards']),
  }),
  mwi: Object.freeze({
    prefixes: Object.freeze(['mw_']),
    skills: Object.freeze(['motionworks-iec', 'engineering-standards']),
  }),
  optix: Object.freeze({
    prefixes: Object.freeze(['optix_']),
    skills: Object.freeze(['factorytalk-optix']),
  }),
  'engineering-resources': Object.freeze({
    prefixes: Object.freeze(['engineering_']),
    skills: Object.freeze([
      'rockwell-l5x',
      'factorytalk-view',
      'motionworks-iec',
      'factorytalk-optix',
      'engineering-standards',
      'legacy-to-logix-migration',
      'rslogix-5',
      'rslogix-500',
    ]),
  }),
  migration: Object.freeze({
    prefixes: Object.freeze(['migration_', 'l5k_', 'slc_']),
    skills: Object.freeze(['legacy-to-logix-migration', 'rslogix-500']),
  }),
  plc5: Object.freeze({
    prefixes: Object.freeze(['plc5_']),
    skills: Object.freeze(['rslogix-5']),
  }),
  slc: Object.freeze({
    prefixes: Object.freeze(['slc500_']),
    skills: Object.freeze(['rslogix-500']),
  }),
})

/** Skill names each agent has loaded, by agent identity. */
const loaded = new WeakMap()
/** The session id an agent was marked under, so disposal can drop both records. */
const sessionOf = new WeakMap()
/** Skill names each session loaded, so a `/name` gesture arms the row before its agent is reachable. */
const sessions = new Map()
/** Roots whose agent listeners are already installed, so a row remount keeps one set. */
const watching = new WeakSet()
/** Tool names per request header, cached on the frozen header the session keeps. */
const declared = new WeakMap()

/**
 * Whether a tool name belongs to a component.
 * @param spec - the component table entry.
 * @param name - the registered tool name.
 * @returns true when the name carries one of the component's prefixes.
 */
function owns(spec, name) {
  return spec.prefixes.some(prefix => name.startsWith(prefix))
}

/**
 * Record that a session loaded a skill.
 * @param session - the session id, when the host supplied one.
 * @param skill - the skill name.
 */
function markSession(session, skill) {
  if (typeof session !== 'string' || session === '') return
  if (typeof skill !== 'string' || skill === '') return
  const names = sessions.get(session)
  if (names === undefined) sessions.set(session, new Set([skill]))
  else names.add(skill)
}

/**
 * Record that an agent loaded a skill.
 *
 * The mark lands on the agent and on its session: a PTC run, a subagent or a
 * resumed turn may reach the condition through either identity, and the `/name`
 * gesture is observed on the session before the agent is looked up.
 *
 * @param agent - the agent, when the host supplied one.
 * @param skill - the skill name.
 */
function mark(agent, skill) {
  if (agent === undefined || agent === null || typeof agent !== 'object') return
  if (typeof skill !== 'string' || skill === '') return
  const names = loaded.get(agent)
  if (names === undefined) loaded.set(agent, new Set([skill]))
  else names.add(skill)
  const session = agent.session?.id
  if (typeof session === 'string' && session !== '') sessionOf.set(agent, session)
  markSession(session, skill)
}

/**
 * The tool names the session's latest request declared.
 * @param agent - the agent whose session is read.
 * @returns the names, or undefined when the session never sent a request.
 */
function declaredNames(agent) {
  const session = agent.session
  if (session === undefined || session === null || typeof session.requestHeader !== 'function') return undefined
  const header = session.requestHeader()
  if (header === undefined || header === null || !Array.isArray(header.tools)) return undefined
  const cached = declared.get(header)
  if (cached !== undefined) return cached
  const names = []
  for (const tool of header.tools) {
    const name = typeof tool === 'string' ? tool : tool?.name
    if (typeof name === 'string') names.push(name)
  }
  declared.set(header, names)
  return names
}

/**
 * Whether a component's tools may be declared for an agent this step.
 *
 * Fail-open on the two cases that are not a decision: no component table entry
 * (a registration nobody gated) and no agent (an executor test, a scripted
 * caller). Fail-closed when the predicate itself cannot answer, so a broken
 * condition hides a component instead of failing step preparation.
 *
 * @param component - the component id from {@link COMPONENTS}.
 * @param agent - the agent preparing the step.
 * @returns whether the component's tools participate in this step.
 */
export function admits(component, agent) {
  try {
    const spec = COMPONENTS[component]
    if (spec === undefined) return true
    if (agent === undefined || agent === null || typeof agent !== 'object') return true
    const skills = loaded.get(agent)
    if (skills !== undefined) {
      for (const skill of spec.skills) if (skills.has(skill)) return true
    }
    const recorded = sessions.get(agent.session?.id)
    if (recorded !== undefined) {
      for (const skill of spec.skills) if (recorded.has(skill)) return true
    }
    const names = declaredNames(agent)
    if (names !== undefined) {
      for (const name of names) if (owns(spec, name)) return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * The registration options for one component's tools.
 * @param component - the component id.
 * @returns the options object the host reads per step.
 */
export function activated(component) {
  if (COMPONENTS[component] === undefined) throw new Error(`activation: unknown component "${component}"`)
  return { when: context => admits(component, context?.agent) }
}

/**
 * Watch the two ways a skill loads, once per root context.
 *
 * Both listeners are plain observations: they read what the host already
 * published and change nothing about the step.
 *
 * - `tools/result`: the `skill` tool returned the body. The agent is on the
 *   execution record, so the mark is exact even for a subagent.
 * - `session/event`: the host appended a `skill-invocation` message, which is
 *   the `/name` gesture rendered as instructions. It arrives before the step's
 *   request, so the mark is in place for the following step like the tool path.
 *
 * `agent/disposed` and `session/disposed` drop the marks, so a reused identity
 * cannot inherit the previous session's surface.
 *
 * @param ctx - the row's context; the first call on a root installs the listeners.
 */
export function observe(ctx) {
  if (ctx === undefined || ctx === null || typeof ctx.on !== 'function') return
  const root = ctx.root ?? ctx
  if (typeof root !== 'object' || root === null || watching.has(root)) return
  watching.add(root)
  root.on('tools/result', (exec, result) => {
    if (result?.isError === true) return
    if (exec?.name !== 'skill') return
    mark(exec.agent, exec.arguments?.name)
  })
  root.on('session/event', (session, event) => {
    if (event?.type !== 'user/message') return
    const source = event.data?.source
    if (source?.kind !== 'skill-invocation') return
    markSession(session?.id, source.name)
  })
  root.on('agent/disposed', ({ agent }) => {
    if (agent === undefined || agent === null || typeof agent !== 'object') return
    const session = sessionOf.get(agent) ?? agent.session?.id
    if (typeof session === 'string') sessions.delete(session)
    loaded.delete(agent)
    sessionOf.delete(agent)
  })
  root.on('session/disposed', session => {
    if (typeof session?.id === 'string') sessions.delete(session.id)
  })
}

/**
 * A context whose tool registrations carry the component's gate.
 *
 * The parts register tools on the context they are handed and never see this
 * wrapper, so no package source changes. Everything except `tools`, `plugin` and
 * `inject` is delegated to the real context, with methods bound to it so Cordis
 * accessors keep their own `this`.
 *
 * @param ctx - the real context.
 * @param component - the component whose tools this subtree registers.
 * @returns a proxied context.
 */
function gated(ctx, component) {
  /** Bound methods, so `ctx.on(...)` keeps a stable identity across reads. */
  const bound = new WeakMap()
  /** The gated tools service, rebuilt only when the real one changes. */
  let tools
  return new Proxy(ctx, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      if (key === 'tools' && value !== null && typeof value === 'object') {
        if (tools === undefined || tools.target !== value) {
          tools = { target: value, proxy: gatedTools(value, component) }
        }
        return tools.proxy
      }
      if (key === 'plugin' && typeof value === 'function') {
        return (part, config) => value.call(target, gatedPart(part, component), config)
      }
      if (key === 'inject' && typeof value === 'function') {
        return (names, callback) => value.call(target, names, typeof callback === 'function'
          ? scope => callback(gated(scope, component))
          : callback)
      }
      if (typeof value !== 'function') return value
      let cached = bound.get(value)
      if (cached === undefined) {
        cached = value.bind(target)
        bound.set(value, cached)
      }
      return cached
    },
  })
}

/**
 * A tools service whose `register` adds the component's condition.
 * @param tools - the real tools service.
 * @param component - the component whose tools this subtree registers.
 * @returns a proxied tools service.
 */
function gatedTools(tools, component) {
  const bound = new WeakMap()
  const spec = COMPONENTS[component]
  const condition = context => admits(component, context?.agent)
  return new Proxy(tools, {
    get(target, key) {
      const value = Reflect.get(target, key, target)
      if (key === 'register' && typeof value === 'function') {
        return (definition, options) => {
          const name = definition?.name
          if (spec === undefined || typeof name !== 'string' || !owns(spec, name)) {
            return value.call(target, definition, options)
          }
          const previous = typeof options?.when === 'function' ? options.when : undefined
          const when = previous === undefined
            ? condition
            : async context => previous(context) !== false && condition(context)
          return value.call(target, definition, { ...options, when })
        }
      }
      if (typeof value !== 'function') return value
      let cached = bound.get(value)
      if (cached === undefined) {
        cached = value.bind(target)
        bound.set(value, cached)
      }
      return cached
    },
  })
}

/**
 * A copy of a plugin that hands its subtree a gated context.
 *
 * The copy keeps the part's name, `inject` and `Config`, so the row's form and
 * the dependency declaration still come from the part. A function plugin (the
 * shape a package exports before Cordis wraps it) is adapted to the object form.
 *
 * @param part - the plugin to wrap.
 * @param component - the component the part registers tools for.
 * @returns the plugin Cordis mounts.
 */
function gatedPart(part, component) {
  const plugin = typeof part === 'function' ? { apply: part } : part
  if (plugin === null || typeof plugin !== 'object' || typeof plugin.apply !== 'function') {
    throw new TypeError(`activation: the ${component} part is not a plugin`)
  }
  return {
    ...plugin,
    apply: (ctx, config) => plugin.apply(gated(ctx, component), config),
  }
}

/**
 * Mount one part of a row with the component's gate.
 * @param ctx - the row's context.
 * @param component - the component the part registers tools for.
 * @param part - the plugin to mount.
 * @param config - the part's config.
 * @returns the mount fiber, so a volatile switch can dispose it.
 */
export function mount(ctx, component, part, config) {
  observe(ctx)
  return ctx.plugin(gatedPart(part, component), config)
}

/**
 * Run a part's `apply` with the component's gate.
 *
 * The vendored parts that a row calls directly (resources, migration, plc5, slc)
 * export `apply` instead of being mounted as plugins, so the wrapper is a call
 * rather than a mount.
 *
 * @param ctx - the row's context.
 * @param component - the component the part registers tools for.
 * @param part - the part module.
 * @param config - the part's config.
 */
export function apply(ctx, component, part, config = {}) {
  observe(ctx)
  if (part === null || typeof part !== 'object' || typeof part.apply !== 'function') {
    throw new TypeError(`activation: the ${component} part has no apply`)
  }
  part.apply(gated(ctx, component), config)
}