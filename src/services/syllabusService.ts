import type { Subject } from '@/types'
import { adminApi, pollJob } from '@/api/endpoints'
import { adaptSubject } from '@/api/adapt'
import { store } from '@/store/store'
import { refreshWorkspace } from '@/store/bootstrap'

async function reloadSubjects(): Promise<Subject[]> {
  const list = (await adminApi.listSubjects()).map(adaptSubject)
  store.set((d) => {
    d.subjects = list
  })
  return list
}

export const syllabusService = {
  getSubjects(): Subject[] {
    return store.get().subjects
  },

  async addSubject(input: { name: string; code: string; description: string }): Promise<Subject> {
    await adminApi.createSubject(input)
    const list = await reloadSubjects()
    return list[list.length - 1]
  },

  async uploadSyllabus(
    subjectId: string,
    file: File,
    onProgress?: (pct: number, phase: string) => void,
  ): Promise<void> {
    const job = await adminApi.uploadSyllabus(subjectId, file)
    onProgress?.(10, 'Uploading file…')
    const finished = await pollJob(job.id, (j) => onProgress?.(Math.max(10, j.progress), j.stage || 'Processing…'))
    if (finished.status === 'FAILED') {
      await reloadSubjects()
      throw new Error(finished.error || 'Syllabus processing failed.')
    }
    onProgress?.(100, 'Ready')
    await reloadSubjects()
  },

  async deleteSyllabus(subjectId: string): Promise<void> {
    await adminApi.deleteSyllabus(subjectId)
    await reloadSubjects()
  },

  reload: reloadSubjects,
  refresh: refreshWorkspace,
}
