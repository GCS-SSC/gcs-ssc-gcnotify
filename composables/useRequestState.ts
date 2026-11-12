import { computed, onScopeDispose, shallowRef } from 'vue'

type RequestState<T, E> =
  | { kind: 'idle' }
  | { kind: 'pending'; controller: AbortController; data: T | null }
  | { kind: 'success'; data: T }
  | { kind: 'error'; data: T | null; error: E }
  | { kind: 'disposed' }

export const useRequestState = <T, E = unknown>() => {
  const state = shallowRef<RequestState<T, E>>({ kind: 'idle' })
  const data = computed(() => 'data' in state.value ? state.value.data : null)
  const pending = computed(() => state.value.kind === 'pending')
  const error = computed(() => state.value.kind === 'error' ? state.value.error : null)
  const owns = (controller: AbortController) => state.value.kind === 'pending' && state.value.controller === controller
  const reset = () => {
    if (state.value.kind === 'disposed') return
    if (state.value.kind === 'pending') state.value.controller.abort()
    state.value = { kind: 'idle' }
  }
  const begin = () => {
    if (state.value.kind === 'disposed') return null
    const previous = data.value
    if (state.value.kind === 'pending') state.value.controller.abort()
    const controller = new AbortController()
    state.value = { kind: 'pending', controller, data: previous }
    return controller
  }
  const succeed = (controller: AbortController, value: T) => {
    if (!owns(controller)) return false
    state.value = { kind: 'success', data: value }
    return true
  }
  const fail = (controller: AbortController, failure: E) => {
    if (!owns(controller)) return false
    state.value = { kind: 'error', data: data.value, error: failure }
    return true
  }
  onScopeDispose(() => {
    reset()
    state.value = { kind: 'disposed' }
  })
  return { state: computed(() => state.value), data, pending, error, owns, reset, begin, succeed, fail }
}
