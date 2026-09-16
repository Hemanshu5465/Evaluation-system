import type { AIEvaluation, ManualEvaluation } from '@/types'
import { AI_STAGES } from '@/data/mockData'
import { evaluatorApi } from '@/api/endpoints'
import { adaptAIEvaluation, adaptManual, adaptSubmission } from '@/api/adapt'
import { delay, store } from '@/store/store'
import { refreshWorkspace, storeUpdate } from '@/store/bootstrap'

const TERMINAL = ['COMPLETED', 'PUBLISHED', 'FAILED']

export const evaluationService = {
  getAIEvaluation(submissionId: string): AIEvaluation | undefined {
    return store.get().aiEvaluations.find((a) => a.submissionId === submissionId)
  },
  getManualEvaluation(submissionId: string): ManualEvaluation | undefined {
    return store.get().manualEvaluations.find((m) => m.submissionId === submissionId)
  },

  async startAIEvaluation(
    submissionId: string,
    onStage?: (stageIndex: number, stageLabel: string) => void,
  ): Promise<AIEvaluation> {
    const startPromise = evaluatorApi.startAIEvaluation(submissionId)

    // Optimistic staged animation while the backend works (kept short — the
    // real evaluation is a single fast model call now).
    for (let i = 0; i < AI_STAGES.length - 1; i++) {
      onStage?.(i, AI_STAGES[i])
      await delay(i === 5 ? 450 : 200)
    }

    const { evaluation_id } = await startPromise
    let dto = await evaluatorApi.getAIEvaluation(evaluation_id)
    while (!TERMINAL.includes(dto.stage)) {
      await delay(700)
      dto = await evaluatorApi.getAIEvaluation(evaluation_id)
    }

    const ev = adaptAIEvaluation(dto)
    storeUpdate.upsertAIEvaluation(ev)
    onStage?.(AI_STAGES.length - 1, AI_STAGES[AI_STAGES.length - 1])

    try {
      const subDto = await evaluatorApi.getSubmission(submissionId)
      storeUpdate.upsertSubmission(adaptSubmission(subDto))
    } catch {
      /* non-fatal */
    }

    if (dto.stage === 'FAILED') throw new Error(dto.error || 'AI evaluation failed.')
    return ev
  },

  async saveManualEvaluation(
    submissionId: string,
    _evaluatorId: string,
    data: Pick<ManualEvaluation, 'scores' | 'comments' | 'strengths' | 'improvements'>,
    status: 'draft' | 'completed',
  ): Promise<ManualEvaluation> {
    const dto = await evaluatorApi.upsertManual(submissionId, {
      scores: data.scores,
      comments: data.comments,
      strengths: data.strengths,
      improvements: data.improvements,
      status: status.toUpperCase(),
    })
    const m = adaptManual(dto)
    storeUpdate.upsertManual(m)
    try {
      const subDto = await evaluatorApi.getSubmission(submissionId)
      storeUpdate.upsertSubmission(adaptSubmission(subDto))
    } catch {
      /* non-fatal */
    }
    return m
  },

  async publishEvaluation(submissionId: string): Promise<void> {
    const sub = store.get().submissions.find((s) => s.id === submissionId)
    const evId = sub?.aiEvaluationId
    if (!evId) throw new Error('No AI evaluation to publish.')
    await evaluatorApi.publishAIEvaluation(evId)
    await refreshWorkspace()
  },

  refresh: refreshWorkspace,
}
