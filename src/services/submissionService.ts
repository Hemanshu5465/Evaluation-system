import type { Submission } from '@/types'
import { studentApi, evaluatorApi } from '@/api/endpoints'
import { adaptSubmission } from '@/api/adapt'
import { store } from '@/store/store'
import { refreshWorkspace, storeUpdate } from '@/store/bootstrap'

export const submissionService = {
  getForStudent(studentId: string, assessmentId?: string): Submission | undefined {
    return store
      .get()
      .submissions.find(
        (s) => s.studentId === studentId && (assessmentId ? s.assessmentId === assessmentId : true),
      )
  },
  getForAssessment(assessmentId: string): Submission[] {
    return store.get().submissions.filter((s) => s.assessmentId === assessmentId)
  },
  getById(id: string): Submission | undefined {
    return store.get().submissions.find((s) => s.id === id)
  },

  validateZip(file: { name: string; sizeMB: number }): { ok: boolean; error?: string } {
    if (!file.name.toLowerCase().endsWith('.zip')) return { ok: false, error: 'Only .zip files are allowed.' }
    if (file.sizeMB > 50) return { ok: false, error: 'ZIP file exceeds the 50 MB limit.' }
    return { ok: true }
  },

  async uploadSubmission(assessmentId: string, file: File, onProgress?: (pct: number) => void): Promise<Submission> {
    onProgress?.(25)
    const dto = await studentApi.uploadSubmission(assessmentId, file)
    onProgress?.(100)
    const sub = adaptSubmission(dto)
    storeUpdate.upsertSubmission(sub)
    return sub
  },

  async submitSubmission(submissionId: string): Promise<Submission> {
    const dto = await studentApi.submit(submissionId)
    const sub = adaptSubmission(dto)
    storeUpdate.upsertSubmission(sub)
    await refreshWorkspace()
    return sub
  },

  async reloadForEvaluator(submissionId: string): Promise<Submission> {
    const dto = await evaluatorApi.getSubmission(submissionId)
    const sub = adaptSubmission(dto)
    storeUpdate.upsertSubmission(sub)
    return sub
  },

  refresh: refreshWorkspace,
}
