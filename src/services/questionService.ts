import type { Question, QuestionStatus } from '@/types'
import { adminApi, pollJob } from '@/api/endpoints'
import { adaptAssessment } from '@/api/adapt'
import { store } from '@/store/store'
import { refreshWorkspace, storeUpdate } from '@/store/bootstrap'

export interface GenerateQuestionInput {
  subjectId: string
  difficulty: Question['difficulty']
  topics: string[]
  subQuestions: number
  evaluationRules: string
  /** Raw material — the topics/questions actually covered in class. When given, the
   *  question is generated strictly from this instead of the full syllabus. */
  classCoverage?: string
}

const DIFF_MAP: Record<Question['difficulty'], string> = {
  Easy: 'EASY',
  Medium: 'MEDIUM',
  Hard: 'HARD',
  Advanced: 'ADVANCED',
}

function assessmentIdForQuestion(questionId: string): string | undefined {
  return store.get().assessments.find((a) => a.questionId === questionId)?.id
}

export const questionService = {
  getQuestions(): Question[] {
    return store.get().questions
  },
  getBySubject(subjectId: string): Question[] {
    return store.get().questions.filter((q) => q.subjectId === subjectId)
  },

  async generateQuestion(input: GenerateQuestionInput, onStage?: (s: string) => void): Promise<Question> {
    onStage?.('Reading syllabus context…')
    const job = await adminApi.generateAssessment({
      subject_id: input.subjectId,
      difficulty: DIFF_MAP[input.difficulty] ?? 'MEDIUM',
      topics: input.topics,
      number_of_parts: input.subQuestions,
      class_coverage: input.classCoverage?.trim() || undefined,
    })
    const finished = await pollJob(job.id, (j) => onStage?.(j.stage || 'Generating…'))
    if (finished.status === 'FAILED') throw new Error(finished.error || 'Question generation failed.')
    const assessmentId = String(finished.result.assessment_id)
    const dto = await adminApi.getAssessment(assessmentId)
    const { assessment, question } = adaptAssessment(dto)
    storeUpdate.upsertAssessment(assessment, question)
    if (!question) throw new Error('Generation returned no question.')
    return question
  },

  async updateQuestion(id: string, patch: Partial<Question>): Promise<void> {
    const assessmentId = assessmentIdForQuestion(id)
    if (!assessmentId) return
    const body: Record<string, unknown> = {}
    if (patch.commonPrompt) body.common_prompt = patch.commonPrompt
    if (Object.keys(body).length === 0) return
    const dto = await adminApi.updateAssessment(assessmentId, body)
    const { assessment, question } = adaptAssessment(dto)
    storeUpdate.upsertAssessment(assessment, question)
  },

  async deleteQuestion(id: string): Promise<void> {
    const assessmentId = assessmentIdForQuestion(id)
    if (!assessmentId) throw new Error('No assessment found for this question.')
    await adminApi.deleteAssessment(assessmentId)
    store.set((d) => {
      d.questions = d.questions.filter((q) => q.id !== id)
      d.assessments = d.assessments.filter((a) => a.id !== assessmentId)
      d.scenarios = d.scenarios.filter((s) => s.questionId !== id)
    })
    await refreshWorkspace()
  },

  async setStatus(id: string, status: QuestionStatus): Promise<void> {
    if (status !== 'published') return // backend has no separate "ready" step
    const assessmentId = assessmentIdForQuestion(id)
    if (!assessmentId) throw new Error('No assessment found for this question.')

    const s = store.get()
    const assessment = s.assessments.find((a) => a.id === assessmentId)!
    const students = s.users.filter((u) => u.role === 'student').map((u) => u.id)
    const evaluators = s.users.filter((u) => u.role === 'evaluator').map((u) => u.id)

    if (assessment.studentIds.length === 0 || !assessment.assignedEvaluatorId) {
      // Demo convenience: assign every student and every evaluator so any
      // account can walk the workflow. Refine on the Assignments page.
      await adminApi.assign(assessmentId, {
        assessment_id: assessmentId,
        student_ids: assessment.studentIds.length ? assessment.studentIds : students,
        evaluator_ids: assessment.assignedEvaluatorId ? [assessment.assignedEvaluatorId] : evaluators,
      })
    }
    const dto = await adminApi.publish(assessmentId)
    const adapted = adaptAssessment(dto)
    storeUpdate.upsertAssessment(adapted.assessment, adapted.question)
    await refreshWorkspace()
  },

  refresh: refreshWorkspace,
}
