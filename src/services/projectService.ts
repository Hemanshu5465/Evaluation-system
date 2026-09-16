import type { Project, ProjectEvaluation, ProjectSubmission } from '@/types'
import { PROJECT_AI_STAGES } from '@/data/mockData'
import { evaluatorApi, studentApi } from '@/api/endpoints'
import { adaptProjectEvaluation, adaptProjectSubmission } from '@/api/adapt'
import { delay, store } from '@/store/store'
import { refreshWorkspace, storeUpdate } from '@/store/bootstrap'

const TERMINAL = ['COMPLETED', 'PUBLISHED', 'FAILED']

export const projectService = {
  getProjects(): Project[] {
    return store.get().projects
  },
  getSubmissionForStudent(studentId: string, projectId?: string): ProjectSubmission | undefined {
    return store
      .get()
      .projectSubmissions.find((p) => p.studentId === studentId && (projectId ? p.projectId === projectId : true))
  },
  getAllSubmissions(): ProjectSubmission[] {
    return store.get().projectSubmissions
  },
  getEvaluation(projectSubmissionId: string): ProjectEvaluation | undefined {
    return store.get().projectEvaluations.find((e) => e.projectSubmissionId === projectSubmissionId)
  },

  async uploadProjectZip(
    projectId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<ProjectSubmission> {
    onProgress?.(30)
    const dto = await studentApi.uploadProject(projectId, file)
    onProgress?.(100)
    const ps = adaptProjectSubmission(dto, null)
    storeUpdate.upsertProjectSubmission(ps)
    return ps
  },

  async submitProject(projectSubmissionId: string): Promise<void> {
    const dto = await studentApi.submitProject(projectSubmissionId)
    storeUpdate.upsertProjectSubmission(adaptProjectSubmission(dto, null))
    await refreshWorkspace()
  },

  async evaluateProject(
    projectSubmissionId: string,
    onStage?: (i: number, label: string) => void,
  ): Promise<ProjectEvaluation> {
    const startPromise = evaluatorApi.startProjectEvaluation(projectSubmissionId)

    for (let i = 0; i < PROJECT_AI_STAGES.length; i++) {
      onStage?.(i, PROJECT_AI_STAGES[i])
      await delay(i === 4 ? 900 : 420)
    }

    const { evaluation_id } = await startPromise
    let dto = await evaluatorApi.getProjectEvaluation(evaluation_id)
    while (!TERMINAL.includes(dto.stage)) {
      await delay(700)
      dto = await evaluatorApi.getProjectEvaluation(evaluation_id)
    }
    const ev = adaptProjectEvaluation(dto)
    storeUpdate.upsertProjectEvaluation(ev)
    store.set((d) => {
      const ps = d.projectSubmissions.find((p) => p.id === projectSubmissionId)
      if (ps) {
        ps.evaluationId = ev.id
        ps.stage = dto.published ? 'published' : 'evaluator_review'
      }
    })
    if (dto.stage === 'FAILED') throw new Error(dto.error || 'Project evaluation failed.')
    return ev
  },

  async publishProjectEvaluation(projectSubmissionId: string): Promise<void> {
    const ev = store.get().projectEvaluations.find((e) => e.projectSubmissionId === projectSubmissionId)
    if (!ev) throw new Error('No project evaluation to publish.')
    await evaluatorApi.publishProjectEvaluation(ev.id)
    store.set((d) => {
      const ps = d.projectSubmissions.find((p) => p.id === projectSubmissionId)
      if (ps) {
        ps.published = true
        ps.stage = 'published'
      }
    })
    await refreshWorkspace()
  },

  refresh: refreshWorkspace,
}
