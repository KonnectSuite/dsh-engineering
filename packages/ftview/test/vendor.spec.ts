import { describe, expect, it } from 'vitest'
import { vendorFailure } from '../src/vendor.ts'

describe('vendorFailure', () => {
  it('keeps the sentences out of a CLIXML dump', () => {
    const dump = [
      '#< CLIXML',
      '<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04">',
      '<S S="Error">Exception from HRESULT: 0x80040301_x000D__x000A_</S>',
      '<S S="Error">At line:1 char:1_x000D__x000A_</S>',
      '</Objs>',
    ].join('\n')
    const text = vendorFailure(dump)
    expect(text).toContain('Exception from HRESULT: 0x80040301')
    expect(text).toContain('At line:1 char:1')
    expect(text).not.toContain('CLIXML')
    expect(text).not.toContain('<S')
  })

  it('passes an ordinary message through, and caps a long one', () => {
    expect(vendorFailure('the engine is busy')).toBe('the engine is busy')
    expect(vendorFailure('')).toBe('')
    expect(vendorFailure('x'.repeat(500)).length).toBeLessThanOrEqual(400)
  })
})
