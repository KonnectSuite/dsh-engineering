/**
 * The engineering bundle's row settings pages.
 *
 * The product rows keep their expensive surfaces in config: L5X editing,
 * Studio 5000 SDK access, live EtherNet/IP and the two writes; MotionWorks IEC
 * edits; the FactoryTalk View edits and Studio handoff. Their schemas already
 * carry the defaults. This face gives the Plugins page a `plugins.row.config`
 * entry per row, so the row grows the Configure control and the switches become
 * visible where they belong.
 *
 * Written by hand instead of compiled from a package: it needs no JSX build,
 * and the bundle's one client registration is assembled by
 * `scripts/build-client.mjs` from every face's committed factory body.
 */
window.__ModuleLoader__.load({
  id: 'dsh-engineering-settings',
  factory: (require) => {
    const React = require('react')
    const { Button, Checkbox } = require('@deepseek-ai/dsh-client-ui-primitives')

    const intro = {
      margin: 0,
      color: 'var(--dsw-alias-text-secondary, #6b7280)',
      fontSize: '13px',
      lineHeight: '1.6',
    }
    const hint = {
      color: 'var(--dsw-alias-text-secondary, #6b7280)',
      fontSize: '12px',
      lineHeight: '1.5',
    }

    /**
     * Render one row's boolean switches, staged until Save.
     *
     * The Plugins page snapshots the form once when it opens the row page and
     * does not subscribe to it, so a form that is still loading at that moment
     * would stay "Loading configuration…" forever. Read the live controller
     * from the client `configForms` service instead: its `get` starts the one
     * describe fetch, and subscribing makes the switches appear when it settles.
     *
     * @param props - the slot owner's `view`, plus this entry's `spec` and the
     *   client `configForms` service.
     * @returns the row's configuration page, its summary, or a status line.
     */
    function RowConfig(props) {
      const { form, spec, view } = props
      const [draft, setDraft] = React.useState(null)
      const [saving, setSaving] = React.useState(false)
      const [notice, setNotice] = React.useState('')

      // Resolve the service lazily: it is provided by the Settings page's own
      // client half, which may load after this bundle's face.
      const configForms = typeof props.configForms === 'function' ? props.configForms() : props.configForms
      const live = configForms === undefined ? undefined : configForms.get(spec.id)
      const subscribe = React.useCallback(
        listener => (live === undefined ? () => {} : live.subscribe(listener)),
        [live],
      )
      const snapshot = React.useCallback(
        () => (live === undefined ? form?.state : live.getSnapshot()),
        [live, form],
      )
      const state = React.useSyncExternalStore(subscribe, snapshot)
      const value = state === undefined ? undefined : state.value

      if (view === 'summary') return React.createElement('span', null, spec.summary)
      if (state === undefined) {
        return React.createElement('p', { style: intro }, 'This row does not expose its configuration to the Plugins page.')
      }
      if (value === undefined) {
        return React.createElement('p', { style: intro },
          state.status === 'unavailable'
            ? 'This row has no configuration to change.'
            : 'Loading configuration…')
      }

      const current = draft === null ? value : draft
      const isText = field => field.type === 'text'
      const same = (field, left, right) => (isText(field)
        ? String(left ?? '') === String(right ?? '')
        : Boolean(left) === Boolean(right))
      const dirty = spec.fields.some(field => !same(field, current[field.key], value[field.key]))
      const writable = state.writable === true
      const setField = (key, next) => {
        setDraft({ ...current, [key]: next })
        setNotice('')
      }
      const save = async () => {
        if (saving || !dirty) return
        setSaving(true)
        setNotice('')
        try {
          const ops = spec.fields.map(field => ({
            op: 'set',
            path: [field.key],
            value: isText(field) ? String(current[field.key] ?? '') : Boolean(current[field.key]),
          }))
          const owner = live === undefined ? form : live
          const accepted = await owner.mutate(ops, state.revision)
          if (accepted) {
            setDraft(null)
            setNotice('Saved.')
          } else {
            setNotice('The Host refused the change.')
          }
        } catch (error) {
          setNotice(error instanceof Error ? error.message : String(error))
        }
        setSaving(false)
      }

      return React.createElement('div', { style: { display: 'grid', gap: '18px' } },
        React.createElement('p', { style: intro }, spec.intro),
        React.createElement('div', { style: { display: 'grid', gap: '14px' } },
          spec.fields.map(field => React.createElement('div', {
            key: field.key,
            style: { display: 'grid', gap: '3px' },
          },
          isText(field)
            ? React.createElement('label', { style: { display: 'grid', gap: '5px' } },
              React.createElement('span', { style: { fontSize: '13px', fontWeight: 600 } }, field.label),
              React.createElement('input', {
                type: 'text',
                value: String(current[field.key] ?? ''),
                disabled: !writable || saving,
                onChange: event => { setField(field.key, event.target.value) },
                placeholder: field.placeholder ?? '',
                style: {
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: '1px solid var(--dsw-alias-border, #d4d4d8)',
                  background: 'transparent',
                  color: 'inherit',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                },
              }))
            : React.createElement(Checkbox, {
              checked: Boolean(current[field.key]),
              onChange: next => { setField(field.key, next) },
              label: field.label,
              disabled: !writable || saving,
            }),
          React.createElement('span', { style: { ...hint, marginLeft: isText(field) ? '0' : '26px' } }, field.description)))),
        React.createElement('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
          React.createElement(Button, {
            variant: 'primary',
            disabled: !writable || saving || !dirty,
            onClick: save,
          }, saving ? 'Saving…' : 'Save changes'),
          dirty
            ? React.createElement(Button, {
              variant: 'ghost',
              disabled: saving,
              onClick: () => { setDraft(null); setNotice('') },
            }, 'Discard')
            : null,
          notice === '' ? null : React.createElement('span', { style: hint }, notice),
          writable ? null : React.createElement('span', { style: hint }, 'This profile does not accept configuration writes.')))
    }

    const L5X = {
      id: 'l5x',
      summary: 'L5X editing, Studio 5000 SDK access and live EtherNet/IP reads are off by default; turn on only what this machine uses.',
      intro: 'The read surface is always on. Each switch below adds tool schemas to every request, so leave off what you do not use.',
      fields: [
        {
          key: 'editing',
          label: 'Editing — nine draft tools',
          description: 'Stages changes against a project copy; applying writes a new .L5X and leaves the open export untouched.',
        },
        {
          key: 'studio',
          label: 'Studio 5000 SDK and supervised controller',
          description: 'Needs Studio 5000 with the Logix Designer SDK service installed; upload, mode change and download are approval-gated.',
        },
        {
          key: 'live',
          label: 'Live EtherNet/IP',
          description: 'Controller identity, tag polling, batch reads up to 64 tags, wall clock, LAN discovery and a bounded trend.',
        },
        {
          key: 'allowWrites',
          label: 'Allow the two live writes',
          description: 'Tag value and controller clock. Each write still needs human approval for that exact operation, and only applies while live is on.',
        },
      ],
    }

    const FTVIEW = {
      id: 'ftview',
      summary: 'FactoryTalk View ME edits and the Studio handoff are on by default; turn them off to keep a read-only profile.',
      intro: 'The read surface and guidance stay on. Edits and the Studio handoff are on by default because the schemas are small.',
      fields: [
        {
          key: 'edit',
          label: 'FactoryTalk View ME edits',
          description: 'Display, HMI tag and structural edits against an exported project.',
        },
        {
          key: 'studio',
          label: 'Studio handoff',
          description: 'Opens the project in FactoryTalk View Studio ME for the parts the agent should not change itself.',
        },
      ],
    }

    const MWI = {
      id: 'mwi',
      summary: 'MotionWorks IEC edits are off by default; session, reads and verification are always on.',
      intro: 'Session, reads and verification stay on. Set the workspace once so the tools find the projects, then turn on editing when you need it.',
      fields: [
        {
          key: 'workspace',
          type: 'text',
          label: 'Workspace root',
          placeholder: 'C:\\Users\\you\\Documents\\Projects',
          description: 'Absolute folder that contains the MotionWorks projects. Leave empty to use the session directory or the mwi.workspace marker in the profile.',
        },
        {
          key: 'edit',
          label: 'Editing — seven staged tools',
          description: 'Code, declarations, structure, blocks and POU package imports/exports. Needs MotionWorks IEC 3 Pro installed.',
        },
      ],
    }

    /**
     * Register the three row configuration pages.
     * @param ctx - the browser plugin context.
     */
    function apply(ctx) {
      const configForms = () => {
        try {
          return ctx.get('configForms')
        } catch {
          return undefined
        }
      }
      const register = (rowId, spec) => {
        ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
          name: 'plugins.row.config',
          key: '@aryacode/dsh-engineering#' + rowId,
          inject: () => ({ spec, configForms }),
        }, RowConfig))
      }
      register('l5x', L5X)
      register('ftview', FTVIEW)
      register('mwi', MWI)
    }

    return { inject: ['slots'], apply }
  },
})
