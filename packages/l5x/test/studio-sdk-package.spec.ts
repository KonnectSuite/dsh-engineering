/**
 * The SDK ships its client package with Studio 5000, and the version moves with the release:
 * v36 shipped CSClient 2.1.974 and v37 ships 2.2.1109. A pinned filename made the preflight
 * report "Compatible SDK client package not installed" on a newer, usable install, so the
 * selector reads the installed folder and picks the highest version.
 */
import { describe, expect, it } from 'vitest'
import { selectSdkClientPackage } from '../src/engine/studio-sdk.ts'

describe('the Logix Designer SDK client package', () => {
  it('accepts the client package installed by a newer Studio 5000 release', () => {
    expect(selectSdkClientPackage([
      'Documentation',
      'Examples',
      'RockwellAutomation.LogixDesigner.CSClient.2.2.1109.nupkg',
    ])).toBe('RockwellAutomation.LogixDesigner.CSClient.2.2.1109.nupkg')
  })

  it('picks the highest installed version when an older package is also present', () => {
    expect(selectSdkClientPackage([
      'RockwellAutomation.LogixDesigner.CSClient.2.1.974.nupkg',
      'RockwellAutomation.LogixDesigner.CSClient.2.2.1109.nupkg',
      'RockwellAutomation.LogixDesigner.CSClient.2.10.3.nupkg',
    ])).toBe('RockwellAutomation.LogixDesigner.CSClient.2.10.3.nupkg')
  })

  it('ignores unrelated files and malformed names', () => {
    expect(selectSdkClientPackage([
      'README.md',
      'RockwellAutomation.LogixDesigner.CSClient.nupkg',
      'RockwellAutomation.LogixDesigner.CSClient.2.2.nupkg',
      'RockwellAutomation.LogixDesigner.CSClient.2.2.1109.zip',
    ])).toBeUndefined()
  })

  it('answers undefined when no client package is installed', () => {
    expect(selectSdkClientPackage([])).toBeUndefined()
    expect(selectSdkClientPackage(['Documentation', 'Examples'])).toBeUndefined()
  })
})
