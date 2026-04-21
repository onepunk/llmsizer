import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectHardware } from '../../src/detection/detect'

// jsdom does not implement WebGL, so we stub HTMLCanvasElement.getContext
// to return fake contexts whose unmasked renderer can be controlled per
// probe. The detect module probes twice: once with
// powerPreference: 'high-performance' and once with no attributes. The
// factory here returns the matching renderer for each call so we can
// verify the discrete-GPU preference on switchable-graphics laptops.

type RendererMap = {
  highPerformance?: string | null
  default?: string | null
}

function installWebGlMock(map: RendererMap) {
  const ext = { UNMASKED_RENDERER_WEBGL: 0x9246 }

  const makeCtx = (renderer: string | null | undefined) => {
    if (!renderer) return null
    return {
      getExtension: (name: string) =>
        name === 'WEBGL_debug_renderer_info' ? ext : null,
      getParameter: (pname: number) =>
        pname === ext.UNMASKED_RENDERER_WEBGL ? renderer : null,
    }
  }

  const spy = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockImplementation(function (
      this: HTMLCanvasElement,
      type: string,
      attrs?: WebGLContextAttributes,
    ) {
      if (type !== 'webgl2' && type !== 'webgl' && type !== 'experimental-webgl') {
        return null
      }
      const isHighPerf = attrs?.powerPreference === 'high-performance'
      const renderer = isHighPerf ? map.highPerformance : map.default
      return makeCtx(renderer) as unknown as RenderingContext
    })

  return spy
}

describe('detectHardware — switchable graphics', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      configurable: true,
      value: 8,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('prefers the NVIDIA dGPU when high-performance probe returns it', () => {
    installWebGlMock({
      highPerformance:
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
      default: 'ANGLE (Intel, Intel UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    })

    const result = detectHardware()
    expect(result.gpu_parsed).toBe('NVIDIA GeForce RTX 4070 Laptop GPU')
    expect(result.gpu_spec).not.toBeNull()
    expect(result.gpu_spec!.vram_gb).toBeGreaterThan(0)
  })

  it('prefers the discrete GPU even when default probe comes back first with iGPU', () => {
    // Some drivers ignore the hint and both probes return the iGPU — but
    // when they differ, we must pick the discrete one regardless of order.
    installWebGlMock({
      highPerformance: 'Intel UHD Graphics 770',
      default:
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Laptop GPU Direct3D11 vs_5_0 ps_5_0, D3D11)',
    })

    const result = detectHardware()
    expect(result.gpu_parsed).toBe('NVIDIA GeForce RTX 3060 Laptop GPU')
  })

  it('falls back to the integrated GPU when no discrete GPU is present', () => {
    installWebGlMock({
      highPerformance: 'Intel UHD Graphics 770',
      default: 'Intel UHD Graphics 770',
    })

    const result = detectHardware()
    expect(result.gpu_parsed).toBe('Intel UHD Graphics 770')
    expect(result.gpu_spec).not.toBeNull()
    expect(result.gpu_spec!.unified).toBe(true)
  })

  it('returns null GPU fields when WebGL is unavailable', () => {
    installWebGlMock({ highPerformance: null, default: null })
    const result = detectHardware()
    expect(result.gpu_renderer).toBeNull()
    expect(result.gpu_parsed).toBeNull()
    expect(result.gpu_spec).toBeNull()
  })

  it('still detects the dGPU when the default probe returns nothing', () => {
    installWebGlMock({
      highPerformance:
        'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      default: null,
    })

    const result = detectHardware()
    expect(result.gpu_parsed).toBe('NVIDIA GeForce RTX 4090')
  })
})
