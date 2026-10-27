import { readFileSync } from 'node:fs'
import { harness } from './test/harness.ts'
const real = 'C:/Users/Admin/Desktop/myWorkspace/Arya Code Plugins Fix/_commission/CarpenterLaminatorLine.L5X'
const out = 'C:/Users/Admin/Desktop/myWorkspace/Arya Code Plugins Fix/_commission/Applied.L5X'
const l5x = harness(new Map([[real, new Uint8Array(readFileSync(real))]]), { editing: true })
const open = await l5x.call('open_project', { path: real })
console.log('open:', open.error ? JSON.stringify(open.error) : open.summary)
console.log('draft_tag:', (await l5x.call('draft_tag', { scope: 'controller', name: 'zz_Commission_Probe', data_type: 'REAL', description: 'commissioning probe' })).error ?? 'ok')
console.log('draft_rung:', (await l5x.call('draft_rung', { program: 'MainProgram', routine: 'MainRoutine', mode: 'replace', rung: 0, text: 'XIC(SystemRunning)OTE(zz_Commission_Probe);' })).error ?? 'ok')
const validate = await l5x.call('draft_validate', {})
console.log('validate:', validate.error ? JSON.stringify(validate.error).slice(0, 300) : `accepted, ${validate.data?.operation_count} op(s)`)
const apply = await l5x.call('draft_apply', { output_path: out })
console.log('apply:', apply.error ? JSON.stringify(apply.error).slice(0, 300) : apply.summary)
const written = l5x.written.get(out) ?? ''
console.log('written bytes:', written.length, '| probe tag present:', written.includes('zz_Commission_Probe'))
