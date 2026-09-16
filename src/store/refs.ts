/**
 * Live, store-backed replacements for the old static mock collections.
 * `students`, `evaluators`, `scenarios`, `projects` behave like arrays but
 * always read the current store snapshot, so components that already subscribe
 * to the store (via useStore / useAppState) re-render with fresh data.
 */
import { store } from './store'
import type { Evaluator, Project, Student, StudentScenario } from '@/types'

function liveArray<T>(getter: () => T[]): T[] {
  return new Proxy([] as unknown as T[], {
    get(_t, prop, receiver) {
      const arr = getter()
      const value = Reflect.get(arr as object, prop, receiver)
      return typeof value === 'function' ? value.bind(arr) : value
    },
    has(_t, prop) {
      return prop in getter()
    },
    ownKeys() {
      return Reflect.ownKeys(getter())
    },
    getOwnPropertyDescriptor(_t, prop) {
      return Object.getOwnPropertyDescriptor(getter(), prop)
    },
  })
}

export const students = liveArray<Student>(
  () => store.get().users.filter((u): u is Student => u.role === 'student'),
)

export const evaluators = liveArray<Evaluator>(
  () => store.get().users.filter((u): u is Evaluator => u.role === 'evaluator'),
)

export const scenarios = liveArray<StudentScenario>(() => store.get().scenarios)

export const projects = liveArray<Project>(() => store.get().projects)
