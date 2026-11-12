import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useRequestState } from '../../composables/useRequestState'

describe('configuration request ownership', () => {
  it('retains evidence while retrying and rejects superseded settlements', () => {
    const scope = effectScope()
    const request = scope.run(() => useRequestState<string, string>())!
    const first = request.begin()!
    expect(request.succeed(first, 'accepted')).toBe(true)
    const second = request.begin()!
    expect(request.data.value).toBe('accepted')
    expect(request.fail(second, 'unavailable')).toBe(true)
    expect(request.error.value).toBe('unavailable')
    const third = request.begin()!
    const replacement = request.begin()!
    expect(third.signal.aborted).toBe(true)
    expect(request.succeed(third, 'stale')).toBe(false)
    expect(request.fail(third, 'stale failure')).toBe(false)
    expect(request.succeed(replacement, 'current')).toBe(true)
    expect(request.data.value).toBe('current')
    scope.stop()
  })

  it('invalidates requests on reset and prevents work after scope disposal', () => {
    const scope = effectScope()
    const request = scope.run(() => useRequestState<string>())!
    const first = request.begin()!
    request.reset()
    expect(first.signal.aborted).toBe(true)
    expect(request.succeed(first, 'stale')).toBe(false)
    expect(request.state.value.kind).toBe('idle')
    const last = request.begin()!
    scope.stop()
    expect(last.signal.aborted).toBe(true)
    expect(request.state.value.kind).toBe('disposed')
    expect(request.begin()).toBeNull()
    request.reset()
    expect(request.fail(last, new Error('late'))).toBe(false)
    expect(request.state.value.kind).toBe('disposed')
  })
})
