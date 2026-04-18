import { describe, it, expect, vi } from 'vitest'
import worker from '../src/worker'

function makeEnv(response: Response) {
  return {
    ASSETS: {
      fetch: vi.fn(async () => response),
    },
  }
}

describe('worker fetch', () => {
  it('delegates every request to env.ASSETS.fetch', async () => {
    const env = makeEnv(new Response('hi', { headers: { 'content-type': 'text/plain' } }))
    const req = new Request('https://llmsizer.com/models.json', {
      headers: { 'user-agent': 'curl/8.0.0' },
    })

    await worker.fetch(req, env as never)

    expect(env.ASSETS.fetch).toHaveBeenCalledTimes(1)
    expect(env.ASSETS.fetch).toHaveBeenCalledWith(req)
  })

  it('passes non-HTML responses through untouched, even for crawlers', async () => {
    const asset = new Response('{"ok":true}', {
      headers: { 'content-type': 'application/json' },
    })
    const env = makeEnv(asset)
    const req = new Request('https://llmsizer.com/models.json', {
      headers: { 'user-agent': 'Slackbot-LinkExpanding 1.0' },
    })

    const response = await worker.fetch(req, env as never)
    expect(response).toBe(asset)
  })

  it('passes HTML through untouched for non-crawler user agents', async () => {
    const asset = new Response('<!doctype html><html><head><title>x</title></head></html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
    const env = makeEnv(asset)
    const req = new Request('https://llmsizer.com/', {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      },
    })

    const response = await worker.fetch(req, env as never)
    expect(response).toBe(asset)
  })

  it('passes HTML through untouched when no user agent is present', async () => {
    const asset = new Response('<!doctype html><html></html>', {
      headers: { 'content-type': 'text/html' },
    })
    const env = makeEnv(asset)
    const req = new Request('https://llmsizer.com/')

    const response = await worker.fetch(req, env as never)
    expect(response).toBe(asset)
  })
})
