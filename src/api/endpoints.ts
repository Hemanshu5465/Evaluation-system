import { api } from './http'
import type {
  AIEvaluationDTO,
  AssessmentDTO,
  CreateEvaluatorResponseDTO,
  JobDTO,
  ManualEvaluationDTO,
  NotificationDTO,
  PageDTO,
  ProjectDTO,
  ProjectEvaluationDTO,
  ProjectSubmissionDTO,
  ScenarioDTO,
  StartEvalDTO,
  SubjectDTO,
  SyllabusAnalysisDTO,
  SubmissionDTO,
  TokenDTO,
  UserDTO,
} from './dto'

export const authApi = {
  login: (identifier: string, password: string) => api.post<TokenDTO>('/auth/login', { identifier, password }),
  me: () => api.get<UserDTO>('/auth/me'),
  logout: (refresh_token: string) => api.post<void>('/auth/logout', { refresh_token }),
}

export const jobsApi = {
  get: (id: string) => api.get<JobDTO>(`/jobs/${id}`),
}

export const notificationsApi = {
  list: () => api.get<NotificationDTO[]>('/notifications'),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  markAll: () => api.post<{ marked_read: number }>('/notifications/read-all'),
}

export const adminApi = {
  dashboard: () => api.get<Record<string, unknown>>('/admin/dashboard'),
  analyticsOverview: () => api.get<Record<string, unknown>>('/admin/analytics/overview'),
  analyticsSubmissions: () => api.get<{ by_day: Record<string, number>; total: number }>('/admin/analytics/submissions'),
  analyticsScores: () =>
    api.get<{ rows: { submission_id: string; ai_score: number; manual_score: number | null }[] }>('/admin/analytics/scores'),
  listSubjects: () => api.get<SubjectDTO[]>('/admin/subjects'),
  createSubject: (body: { name: string; code: string; description: string }) =>
    api.post<SubjectDTO>('/admin/subjects', body),
  updateSubject: (id: string, body: Record<string, unknown>) => api.put<SubjectDTO>(`/admin/subjects/${id}`, body),
  deleteSubject: (id: string) => api.del<void>(`/admin/subjects/${id}`),
  uploadSyllabus: (id: string, file: File) => api.upload<JobDTO>(`/admin/subjects/${id}/syllabus`, file),
  workspaceSyllabus: (file: File) => api.upload<SyllabusAnalysisDTO>('/admin/workspace/syllabus', file),
  getSyllabus: (id: string) => api.get(`/admin/subjects/${id}/syllabus`),
  deleteSyllabus: (id: string) => api.del<void>(`/admin/subjects/${id}/syllabus`),
  generateAssessment: (body: {
    subject_id: string
    title?: string
    difficulty: string
    topics: string[]
    number_of_parts: number
    deadline?: string | null
    class_coverage?: string
  }) => api.post<JobDTO>('/admin/assessments/generate', body),
  listAssessments: () => api.get<AssessmentDTO[]>('/admin/assessments'),
  getAssessment: (id: string) => api.get<AssessmentDTO>(`/admin/assessments/${id}`),
  deleteAssessment: (id: string) => api.del<void>(`/admin/assessments/${id}`),
  updateAssessment: (id: string, body: Record<string, unknown>) =>
    api.put<AssessmentDTO>(`/admin/assessments/${id}`, body),
  listScenarios: (id: string) => api.get<ScenarioDTO[]>(`/admin/assessments/${id}/scenarios`),
  generateScenarios: (id: string) => api.post<JobDTO>(`/admin/assessments/${id}/generate-scenarios`),
  assign: (id: string, body: { assessment_id: string; evaluator_ids?: string[]; student_ids?: string[] }) =>
    api.post<AssessmentDTO>(`/admin/assessments/${id}/assign`, body),
  publish: (id: string, durationMinutes?: number | null) =>
    api.post<AssessmentDTO>(`/admin/assessments/${id}/publish`, durationMinutes ? { duration_minutes: durationMinutes } : undefined),
  listStudents: () => api.get<UserDTO[]>('/admin/students'),
  listEvaluators: () => api.get<UserDTO[]>('/admin/evaluators'),
  createEvaluator: (body: { name: string; email: string; department?: string }) =>
    api.post<CreateEvaluatorResponseDTO>('/admin/evaluators', body),
  listProjects: () => api.get<ProjectDTO[]>('/admin/projects'),
  createProject: (body: Record<string, unknown>) => api.post<ProjectDTO>('/admin/projects', body),
}

export const studentApi = {
  dashboard: () => api.get<Record<string, unknown>>('/student/dashboard'),
  listAssessments: () => api.get<AssessmentDTO[]>('/student/assessments'),
  getAssessment: (id: string) => api.get<AssessmentDTO>(`/student/assessments/${id}`),
  /** Called when the student opens the question. Starts their personal countdown
   *  (if the assessment has a time limit) — safe to call every time they open it. */
  startAssessment: (id: string) => api.post<AssessmentDTO>(`/student/assessments/${id}/start`),
  getScenario: (id: string, wait = true) =>
    api.get<ScenarioDTO>(`/student/assessments/${id}/scenario?wait=${wait}`),
  uploadSubmission: (assessmentId: string, file: File) =>
    api.upload<SubmissionDTO>(`/student/assessments/${assessmentId}/submissions`, file),
  submit: (submissionId: string) => api.post<SubmissionDTO>(`/student/submissions/${submissionId}/submit`),
  listSubmissions: () => api.get<SubmissionDTO[]>('/student/submissions'),
  getSubmission: (id: string) => api.get<SubmissionDTO>(`/student/submissions/${id}`),
  result: (id: string) => api.get<Record<string, unknown>>(`/student/submissions/${id}/result`),
  listProjects: () => api.get<ProjectDTO[]>('/student/projects'),
  getProject: (id: string) => api.get<ProjectDTO>(`/student/projects/${id}`),
  uploadProject: (projectId: string, file: File) =>
    api.upload<ProjectSubmissionDTO>(`/student/projects/${projectId}/submissions`, file),
  submitProject: (submissionId: string) =>
    api.post<ProjectSubmissionDTO>(`/student/project-submissions/${submissionId}/submit`),
  listProjectSubmissions: (projectId: string) =>
    api.get<ProjectSubmissionDTO[]>(`/student/projects/${projectId}/submissions`),
  projectResult: (submissionId: string) =>
    api.get<Record<string, unknown>>(`/student/project-submissions/${submissionId}/result`),
}

export const evaluatorApi = {
  dashboard: () => api.get<Record<string, unknown>>('/evaluator/dashboard'),
  listSubmissions: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams({ page_size: '100', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })
    return api.get<PageDTO<SubmissionDTO>>(`/evaluator/submissions?${q}`)
  },
  getSubmission: (id: string) => api.get<SubmissionDTO>(`/evaluator/submissions/${id}`),
  getAssessment: (id: string) => api.get<AssessmentDTO>(`/evaluator/assessments/${id}`),
  testCases: (submissionId: string) => api.get(`/evaluator/submissions/${submissionId}/test-cases`),
  getSubmissionFile: (submissionId: string, path: string) =>
    api.get<{ path: string; is_text: boolean; size_bytes: number; content: string; truncated: boolean }>(
      `/evaluator/submissions/${submissionId}/file?path=${encodeURIComponent(path)}`,
    ),
  startAIEvaluation: (submissionId: string, force = false) =>
    api.post<StartEvalDTO>(`/evaluator/submissions/${submissionId}/ai-evaluate?force_new_version=${force}`),
  getAIEvaluation: (id: string) => api.get<AIEvaluationDTO>(`/evaluator/ai-evaluations/${id}`),
  publishAIEvaluation: (id: string) => api.post<AIEvaluationDTO>(`/evaluator/ai-evaluations/${id}/publish`),
  upsertManual: (submissionId: string, body: Record<string, unknown>) =>
    api.post<ManualEvaluationDTO>(`/evaluator/submissions/${submissionId}/manual-evaluation`, body),
  listProjectSubmissions: () => api.get<ProjectSubmissionDTO[]>('/evaluator/projects/submissions'),
  getProjectSubmission: (id: string) => api.get<ProjectSubmissionDTO>(`/evaluator/projects/submissions/${id}`),
  startProjectEvaluation: (submissionId: string, force = false) =>
    api.post<StartEvalDTO>(`/evaluator/projects/submissions/${submissionId}/ai-evaluate?force_new_version=${force}`),
  getProjectEvaluation: (id: string) => api.get<ProjectEvaluationDTO>(`/evaluator/projects/evaluations/${id}`),
  publishProjectEvaluation: (id: string) =>
    api.post<ProjectEvaluationDTO>(`/evaluator/projects/evaluations/${id}/publish`),
}

export async function pollJob(id: string, onTick?: (job: JobDTO) => void, intervalMs = 700, timeoutMs = 120_000): Promise<JobDTO> {
  const start = Date.now()
  for (;;) {
    const job = await jobsApi.get(id)
    onTick?.(job)
    if (job.status === 'COMPLETED' || job.status === 'FAILED') return job
    if (Date.now() - start > timeoutMs) return job
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
