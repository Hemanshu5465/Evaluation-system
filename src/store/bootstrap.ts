import { adminApi, evaluatorApi, notificationsApi, studentApi } from '@/api/endpoints'
import {
  adaptAIEvaluation,
  adaptAssessment,
  adaptManual,
  adaptNotification,
  adaptProject,
  adaptProjectEvaluation,
  adaptProjectSubmission,
  adaptResultDictToAI,
  adaptResultDictToProject,
  adaptScenario,
  adaptSubject,
  adaptSubmission,
  adaptUser,
  scenarioFromSubmission,
} from '@/api/adapt'
import type { AppState } from './store'
import { store } from './store'
import type { StudentScenario } from '@/types'

function upsert<T extends { id: string }>(list: T[], incoming: T[]): T[] {
  const map = new Map(list.map((x) => [x.id, x]))
  for (const item of incoming) map.set(item.id, item)
  return [...map.values()]
}

function upsertScenarios(list: StudentScenario[], incoming: StudentScenario[]): StudentScenario[] {
  const key = (s: StudentScenario) => s.id || `${s.studentId}:${s.questionId}`
  const map = new Map(list.map((x) => [key(x), x]))
  for (const s of incoming) {
    const existing = map.get(key(s))
    map.set(key(s), existing ? { ...existing, ...s, questionId: s.questionId || existing.questionId } : s)
  }
  return [...map.values()]
}

async function loadAdmin(patch: Partial<AppState>) {
  const [subjects, students, evaluators, assessmentDtos, projects, notifs] = await Promise.all([
    adminApi.listSubjects(),
    adminApi.listStudents(),
    adminApi.listEvaluators(),
    adminApi.listAssessments(),
    adminApi.listProjects().catch(() => []),
    notificationsApi.list().catch(() => []),
  ])
  patch.subjects = subjects.map(adaptSubject)
  patch.users = [...students, ...evaluators].map(adaptUser)
  const assessments = assessmentDtos.map(adaptAssessment)
  patch.assessments = assessments.map((a) => a.assessment)
  patch.questions = assessments.map((a) => a.question).filter(Boolean) as AppState['questions']
  patch.projects = projects.map(adaptProject)
  const user = store.get().currentUser!
  patch.notifications = notifs.map((n) => adaptNotification(n, 'admin', user.id))
}

async function loadEvaluator(patch: Partial<AppState>) {
  const user = store.get().currentUser!
  const [subPage, projSubs, notifs] = await Promise.all([
    evaluatorApi.listSubmissions(),
    evaluatorApi.listProjectSubmissions().catch(() => []),
    notificationsApi.list().catch(() => []),
  ])
  const subs = subPage.items
  patch.submissions = subs.map(adaptSubmission)

  // people + scenarios come embedded in the submission payload
  const users = new Map<string, ReturnType<typeof adaptUser>>()
  for (const s of subs) {
    if (s.student_name)
      users.set(s.student_id, adaptUser({
        id: s.student_id, name: s.student_name, email: '', role: 'STUDENT',
        student_id: s.student_code, department: null, is_active: true, created_at: '',
      }))
  }
  // students + project stubs that only appear via project submissions
  for (const ps of projSubs) {
    if (ps.student_name && !users.has(ps.student_id))
      users.set(
        ps.student_id,
        adaptUser({
          id: ps.student_id, name: ps.student_name, email: '', role: 'STUDENT',
          student_id: ps.student_code ?? null, department: null, is_active: true, created_at: '',
        }),
      )
  }
  const projMap = new Map<string, AppState['projects'][number]>()
  for (const ps of projSubs) {
    if (!projMap.has(ps.project_id))
      projMap.set(ps.project_id, {
        id: ps.project_id,
        title: ps.project_title ?? 'Project',
        brief: '',
        deadline: '',
        expectedFiles: [],
        assignedEvaluatorId: user.id,
      })
  }
  patch.projects = [...projMap.values()]

  const assignedStudentIds = [...new Set(subs.map((s) => s.student_id))]
  const selfEval = adaptUser({
    id: user.id, name: user.name, email: user.email, role: 'EVALUATOR',
    student_id: null, department: (user as { department?: string }).department ?? null, is_active: true, created_at: '',
  })
  ;(selfEval as { assignedStudentIds: string[] }).assignedStudentIds = assignedStudentIds
  users.set(user.id, selfEval)
  patch.users = [...users.values()]
  // keep currentUser in sync so evaluator pages can filter by assignment
  store.set((d) => {
    if (d.currentUser && d.currentUser.id === user.id) {
      ;(d.currentUser as unknown as { assignedStudentIds: string[] }).assignedStudentIds = assignedStudentIds
    }
  })
  patch.scenarios = subs.map(scenarioFromSubmission).filter(Boolean) as StudentScenario[]

  // load each distinct assessment (question + rubric) the evaluator is assigned to
  const assessmentIds = [...new Set(subs.map((s) => s.assessment_id))]
  const assessments = await Promise.all(
    assessmentIds.map((id) => evaluatorApi.getAssessment(id).then(adaptAssessment).catch(() => null)),
  )
  patch.assessments = assessments.filter(Boolean).map((a) => a!.assessment)
  patch.questions = assessments.filter(Boolean).map((a) => a!.question).filter(Boolean) as AppState['questions']

  // AI evaluations + manual evaluations that already exist (needed by detail/list pages after a full reload)
  patch.manualEvaluations = subs
    .map((s) => (s.manual_evaluation ? adaptManual(s.manual_evaluation) : null))
    .filter(Boolean) as AppState['manualEvaluations']

  const aiEvals = await Promise.all(
    subs.map((s) =>
      s.ai_evaluation_id && (s.ai_stage === 'COMPLETED' || s.ai_stage === 'PUBLISHED')
        ? evaluatorApi.getAIEvaluation(s.ai_evaluation_id).then(adaptAIEvaluation).catch(() => null)
        : Promise.resolve(null),
    ),
  )
  patch.aiEvaluations = aiEvals.filter(Boolean) as AppState['aiEvaluations']

  // project submissions + their completed evaluations
  patch.projectSubmissions = projSubs.map((ps) => adaptProjectSubmission(ps))
  const projEvals = await Promise.all(
    projSubs.map((ps) =>
      ps.evaluation_id && (ps.evaluation_stage === 'COMPLETED' || ps.evaluation_stage === 'PUBLISHED')
        ? evaluatorApi.getProjectEvaluation(ps.evaluation_id).then(adaptProjectEvaluation).catch(() => null)
        : Promise.resolve(null),
    ),
  )
  patch.projectEvaluations = projEvals.filter(Boolean) as AppState['projectEvaluations']
  patch.notifications = notifs.map((n) => adaptNotification(n, 'evaluator', user.id))
}

async function loadStudent(patch: Partial<AppState>) {
  const user = store.get().currentUser!
  const [assessmentDtos, submissionDtos, projectDtos, notifs] = await Promise.all([
    studentApi.listAssessments(),
    studentApi.listSubmissions(),
    studentApi.listProjects().catch(() => []),
    notificationsApi.list().catch(() => []),
  ])
  const assessments = assessmentDtos.map(adaptAssessment)
  patch.assessments = assessments.map((a) => a.assessment)
  patch.questions = assessments.map((a) => a.question).filter(Boolean) as AppState['questions']
  patch.submissions = submissionDtos.map(adaptSubmission)
  patch.projects = projectDtos.map(adaptProject)
  patch.users = [
    adaptUser({
      id: user.id, name: user.name, email: user.email, role: 'STUDENT',
      student_id: (user as { studentCode?: string }).studentCode ?? null, department: null,
      is_active: true, created_at: '',
    }),
  ]

  // fetch this student's scenario for each assessment (fast path: don't block on generation)
  const scenarios = await Promise.all(
    assessments.map(async (a) => {
      try {
        const dto = await studentApi.getScenario(a.assessment.id, false)
        return adaptScenario(dto, { questionId: a.assessment.questionId, studentId: user.id })
      } catch {
        return null
      }
    }),
  )
  patch.scenarios = scenarios.filter(Boolean) as StudentScenario[]

  // published assessment results (student-safe)
  const results = await Promise.all(
    patch.submissions.map((s) =>
      s.published ? studentApi.result(s.id).catch(() => null) : Promise.resolve(null),
    ),
  )
  patch.aiEvaluations = results.filter(Boolean).map((r) => adaptResultDictToAI(r as Record<string, unknown>))

  // project submissions + their published results
  const psubs = (await Promise.all(
    projectDtos.map((p) => studentApi.listProjectSubmissions(p.id).catch(() => [])),
  )).flat()
  patch.projectSubmissions = psubs.map((ps) => adaptProjectSubmission(ps, null))
  const projResults = await Promise.all(
    psubs.map((ps) =>
      ps.status === 'PUBLISHED' || ps.locked
        ? studentApi.projectResult(ps.id).catch(() => null)
        : Promise.resolve(null),
    ),
  )
  patch.projectEvaluations = projResults.filter(Boolean).map((r) => adaptResultDictToProject(r as Record<string, unknown>))
  // mark project submissions that have a published result
  patch.projectSubmissions = patch.projectSubmissions.map((ps) => {
    const hasResult = patch.projectEvaluations!.some((pe) => pe.projectSubmissionId === ps.id)
    return hasResult ? { ...ps, published: true, stage: 'published' as const, evaluationId: ps.id } : ps
  })
  patch.notifications = notifs.map((n) => adaptNotification(n, 'student', user.id))
}

export async function bootstrapWorkspace(): Promise<void> {
  const user = store.get().currentUser
  if (!user) return
  store.set((d) => {
    d.loading = true
  })
  const patch: Partial<AppState> = {}
  try {
    if (user.role === 'admin') await loadAdmin(patch)
    else if (user.role === 'evaluator') await loadEvaluator(patch)
    else await loadStudent(patch)
    store.set((d) => {
      Object.assign(d, patch)
      d.bootstrapped = true
      d.loading = false
    })
  } catch (e) {
    store.set((d) => {
      d.loading = false
      d.bootstrapped = true
    })
    throw e
  }
}

export async function refreshWorkspace(): Promise<void> {
  await bootstrapWorkspace()
}

// Targeted store updates used by services after a mutation
export const storeUpdate = {
  upsertSubjects(list: AppState['subjects']) {
    store.set((d) => {
      d.subjects = upsert(d.subjects, list)
    })
  },
  upsertAssessment(assessment: AppState['assessments'][number], question: AppState['questions'][number] | null) {
    store.set((d) => {
      d.assessments = upsert(d.assessments, [assessment])
      if (question) d.questions = upsert(d.questions, [question])
    })
  },
  upsertSubmission(sub: AppState['submissions'][number]) {
    store.set((d) => {
      d.submissions = upsert(d.submissions, [sub])
    })
  },
  upsertScenarios(list: StudentScenario[]) {
    store.set((d) => {
      d.scenarios = upsertScenarios(d.scenarios, list)
    })
  },
  upsertAIEvaluation(ev: AppState['aiEvaluations'][number]) {
    store.set((d) => {
      d.aiEvaluations = upsert(d.aiEvaluations, [ev])
    })
  },
  upsertManual(m: AppState['manualEvaluations'][number]) {
    store.set((d) => {
      d.manualEvaluations = upsert(d.manualEvaluations, [m])
    })
  },
  upsertProjectSubmission(ps: AppState['projectSubmissions'][number]) {
    store.set((d) => {
      d.projectSubmissions = upsert(d.projectSubmissions, [ps])
    })
  },
  upsertProjectEvaluation(pe: AppState['projectEvaluations'][number]) {
    store.set((d) => {
      d.projectEvaluations = upsert(d.projectEvaluations, [pe])
    })
  },
}
