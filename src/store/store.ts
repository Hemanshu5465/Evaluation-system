import { useSyncExternalStore } from 'react'
import type {
  AIEvaluation,
  Assessment,
  Evaluator,
  ManualEvaluation,
  Notification,
  Project,
  ProjectEvaluation,
  ProjectSubmission,
  Question,
  Student,
  StudentScenario,
  Subject,
  Submission,
  Toast,
  User,
} from '@/types'

export interface AppState {
  currentUser: User | null
  bootstrapped: boolean
  loading: boolean
  users: (User | Student | Evaluator)[]
  subjects: Subject[]
  questions: Question[]
  scenarios: StudentScenario[]
  assessments: Assessment[]
  submissions: Submission[]
  aiEvaluations: AIEvaluation[]
  manualEvaluations: ManualEvaluation[]
  projects: Project[]
  projectSubmissions: ProjectSubmission[]
  projectEvaluations: ProjectEvaluation[]
  notifications: Notification[]
  toasts: Toast[]
}

function initialState(): AppState {
  return {
    currentUser: null,
    bootstrapped: false,
    loading: false,
    users: [],
    subjects: [],
    questions: [],
    scenarios: [],
    assessments: [],
    submissions: [],
    aiEvaluations: [],
    manualEvaluations: [],
    projects: [],
    projectSubmissions: [],
    projectEvaluations: [],
    notifications: [],
    toasts: [],
  }
}

let state: AppState = initialState()
const listeners = new Set<() => void>()

function emit() {
  state = { ...state }
  listeners.forEach((l) => l())
}

export const store = {
  get: () => state,
  set(mutator: (draft: AppState) => void) {
    mutator(state)
    emit()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  reset() {
    state = initialState()
    emit()
  },
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(state),
    () => selector(state),
  )
}

export function useAppState(): AppState {
  return useSyncExternalStore(store.subscribe, store.get, store.get)
}

// ---- toast helpers ----
export function pushToast(t: Omit<Toast, 'id'>) {
  const toast: Toast = { ...t, id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }
  store.set((d) => {
    d.toasts = [...d.toasts, toast]
  })
  setTimeout(() => dismissToast(toast.id), 4600)
}

export function dismissToast(id: string) {
  store.set((d) => {
    d.toasts = d.toasts.filter((t) => t.id !== id)
  })
}

export const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
