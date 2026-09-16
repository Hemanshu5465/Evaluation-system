import type { Admin, Evaluator, Student } from '@/types'
import { useStore } from '@/store/store'

export function useCurrentUser() {
  return useStore((s) => s.currentUser)
}

export function useAdmin(): Admin {
  return useStore((s) => s.currentUser) as Admin
}
export function useEvaluator(): Evaluator {
  return useStore((s) => s.currentUser) as Evaluator
}
export function useStudent(): Student {
  return useStore((s) => s.currentUser) as Student
}
