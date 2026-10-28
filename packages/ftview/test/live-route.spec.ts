import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { liveRoute, displayRoute, globalsRoute, imageRoute } from '../src/live-route.ts'
import type { LiveRead } from '../src/live-read.ts'

/** One export folder with a tag CSV that maps RUN to a controller tag. */
function exportFolder(): string {
  const root = join(tmpdir(), `ftview-live-${randomUUID()}`)
  mkdirSync(join(root, 'Tags'), { recursive: true })
  const header = ';Tag Type, Tag Name, Tag Description, Read Only, Data Source, Security Code, Alarmed, Native Type, Value Type, Min Analog, Max Analog, Initial Analog, Scale, Offset, DeadBand, Units, Off Label Digital, On Label Digital, Initial Digital, Length String, Initial String, Retentive, Address'
  const run = 'D, RUN, , F, D, *, F, , , , , , , , , , 0, 1, 0, , , , ::[PLC]Run'
  const memory = 'D, MEM, , F, D, *, F, , , , , , , , , , 0, 1, 0, , , ,'
  writeFileSync(join(root, 'Tags', 'App.csv'), `${header}\n;###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!\n${run}\n${memory}\n`)
  return root
}

/** A reader that answers one known value. */
const reader = async (): Promise<LiveRead> => ({
  values: { Run: { quality: 'good', value: true } },
  controller: { product_name: 'Laminator', revision: '35' },
  read_at: '2026-10-27T00:00:00.000Z',
})

describe('the live route', () => {
  it('maps HMI tags to controller tags and never invents a memory value', async () => {
    const root = exportFolder()
    const answer = await liveRoute(new URL(`http://x/live?root=${encodeURIComponent(root)}&ip=192.168.1.10&slot=0&tags=RUN,MEM`), { read: reader })
    expect(answer.status).toBe(200)
    const body = answer.body as { values: Record<string, { value?: unknown; quality: string }>; not_live: { hmi: string }[]; tags_read: string[] }
    expect(body.values.RUN).toMatchObject({ value: true, quality: 'good' })
    expect(body.not_live.map(entry => entry.hmi)).toEqual(['MEM'])
    expect(body.tags_read).toEqual(['Run'])
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses an invalid address, slot or tag list', async () => {
    const root = exportFolder()
    for (const query of ['ip=not-an-ip&slot=0&tags=RUN', 'ip=192.168.1.10&slot=99&tags=RUN', 'ip=192.168.1.10&slot=0&tags=']) {
      const answer = await liveRoute(new URL(`http://x/live?root=${encodeURIComponent(root)}&${query}`), { read: reader })
      expect(answer.status).toBe(400)
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('honours the address allowlist', async () => {
    const root = exportFolder()
    const answer = await liveRoute(new URL(`http://x/live?root=${encodeURIComponent(root)}&ip=10.0.0.5&slot=0&tags=RUN`), { read: reader, allowedAddresses: ['192.168.1.10'] })
    expect(answer.status).toBe(403)
    rmSync(root, { recursive: true, force: true })
  })

  it('reports a controller failure as a bad gateway, not a value', async () => {
    const root = exportFolder()
    const answer = await liveRoute(new URL(`http://x/live?root=${encodeURIComponent(root)}&ip=192.168.1.10&slot=0&tags=RUN`), {
      read: async () => { throw new Error('connection refused') },
    })
    expect(answer.status).toBe(502)
    expect(JSON.stringify(answer.body)).toContain('connection refused')
    rmSync(root, { recursive: true, force: true })
  })
})

describe('the display file route', () => {
  it('returns a display by name and refuses traversal', () => {
    const root = exportFolder()
    mkdirSync(join(root, 'Displays'), { recursive: true })
    writeFileSync(join(root, 'Displays', 'Main Screen.xml'), '<gfx/>')
    const found = displayRoute(new URL(`http://x/display?root=${encodeURIComponent(root)}&name=Main%20Screen`))
    expect(found.status).toBe(200)
    expect(found.body).toContain('<gfx')
    expect(displayRoute(new URL(`http://x/display?root=${encodeURIComponent(root)}&name=Absent`)).status).toBe(404)
    expect(displayRoute(new URL(`http://x/display?root=${encodeURIComponent(root)}&name=../secret`)).status).toBe(400)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('the globals and image routes', () => {
  it('serves Global Objects and refuses traversal outside Images', () => {
    const root = exportFolder()
    mkdirSync(join(root, 'Global Objects'), { recursive: true })
    mkdirSync(join(root, 'Images'), { recursive: true })
    writeFileSync(join(root, 'Global Objects', 'Header_Footer.xml'), '<gfx><panel name="P"/></gfx>')
    writeFileSync(join(root, 'Images', 'logo.bmp'), 'bmp')
    writeFileSync(join(root, 'Images', 'Equilateral triangle.bmp'), 'bmp')
    const globals = JSON.parse(globalsRoute(new URL(`http://x/globals?root=${encodeURIComponent(root)}`)).body) as { files: { name: string }[] }
    expect(globals.files.map(file => file.name)).toEqual(['Header_Footer'])
    const image = imageRoute(new URL(`http://x/image?root=${encodeURIComponent(root)}&name=logo.bmp`))
    expect(image.status).toBe(200)
    expect(image.contentType).toBe('image/bmp')
    expect(imageRoute(new URL(`http://x/image?root=${encodeURIComponent(root)}&name=../secret.png`)).status).toBe(400)
    expect(imageRoute(new URL(`http://x/image?root=${encodeURIComponent(root)}&name=absent.png`)).status).toBe(404)
    rmSync(root, { recursive: true, force: true })
  })
})