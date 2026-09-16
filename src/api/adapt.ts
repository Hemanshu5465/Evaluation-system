import type {
  AIEvaluation,
  AITestCase,
  Assessment,
  Evaluator,
  ManualEvaluation,
  Notification,
  Project,
  ProjectEvaluation,
  ProjectSubmission,
  Question,
  Role,
  Student,
  StudentScenario,
  Subject,
  Submission,
  SubmissionFile,
  SubmissionStage,
  User,
} from '@/types'
import type {
  AIEvaluationDTO,
  AssessmentDTO,
  ManualEvaluationDTO,
  NotificationDTO,
  ProjectDTO,
  ProjectEvaluationDTO,
  ProjectSubmissionDTO,
  ScenarioDTO,
  SubjectDTO,
  SubmissionDTO,
  UserDTO,
} from './dto'

const PALETTE = ['#136853', '#6333cc', '#b45309', '#0e7490', '#be123c', '#4d7c0f', '#7c3aed', '#0f766e', '#1c8168']

function colorFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const ROLE_MAP: Record<string, Role> = { ADMIN: 'admin', EVALUATOR: 'evaluator', STUDENT: 'student' }
const DIFFICULTY_MAP: Record<string, Question['difficulty']> = {
  EASY: 'Easy',
  MEDIUM: 'Medium',
  HARD: 'Hard',
  ADVANCED: 'Advanced',
}

export function adaptUser(dto: UserDTO): User | Student | Evaluator {
  const base: User = {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: ROLE_MAP[dto.role],
    avatarColor: colorFor(dto.id),
  }
  if (dto.role === 'STUDENT') {
    return { ...base, role: 'student', studentCode: dto.student_id ?? '—' } as Student
  }
  if (dto.role === 'EVALUATOR') {
    return { ...base, role: 'evaluator', department: dto.department ?? 'Faculty', assignedStudentIds: [] } as Evaluator
  }
  return base
}

export function adaptSubject(dto: SubjectDTO, index: number): Subject {
  const syl = dto.syllabus
  const statusMap: Record<string, Subject['syllabus'] extends null ? never : 'processing' | 'ready'> = {
    UPLOADED: 'processing',
    PROCESSING: 'processing',
    PROCESSED: 'ready',
    FAILED: 'processing',
  } as never
  return {
    id: dto.id,
    slot: (Math.min(index + 1, 3)) as 1 | 2 | 3,
    name: dto.name,
    code: dto.code,
    semester: dto.semester ?? '',
    description: dto.description || 'No description provided.',
    syllabus: syl
      ? {
          id: syl.id,
          fileName: syl.source_filename,
          fileType: (syl.source_filename.split('.').pop()?.toUpperCase() as 'PDF' | 'DOCX' | 'TXT') || 'PDF',
          sizeMB: 1.2,
          uploadedAt: syl.created_at,
          status: syl.processing_status === 'PROCESSED' ? 'ready' : 'processing',
          progress: syl.processing_status === 'PROCESSED' ? 100 : 60,
          topics: syl.topics.map((t) => t.name),
          learningOutcomes: syl.learning_outcomes,
        }
      : null,
  }
}

const ASSESS_STATUS_MAP: Record<string, Assessment['status']> = {
  DRAFT: 'draft',
  GENERATING: 'draft',
  READY: 'draft',
  PUBLISHED: 'published',
  CLOSED: 'closed',
  ARCHIVED: 'closed',
}
const Q_STATUS_MAP: Record<string, Question['status']> = {
  DRAFT: 'draft',
  GENERATING: 'generating',
  READY: 'ready',
  PUBLISHED: 'published',
  CLOSED: 'published',
  ARCHIVED: 'published',
}

export function adaptAssessment(dto: AssessmentDTO): { assessment: Assessment; question: Question | null } {
  const assessment: Assessment = {
    id: dto.id,
    title: dto.title,
    subjectId: dto.subject_id,
    subjectName: dto.subject_name ?? dto.title,
    questionId: dto.question?.id ?? '',
    type: 'scenario',
    status: ASSESS_STATUS_MAP[dto.status] ?? 'draft',
    deadline: dto.deadline ?? '',
    createdAt: dto.created_at,
    assignedEvaluatorId: dto.evaluator_ids[0] ?? '',
    studentIds: dto.student_ids,
    durationMinutes: dto.duration_minutes,
    startedAt: dto.started_at,
    expiresAt: dto.expires_at,
  }
  const q = dto.question
  const question: Question | null = q
    ? {
        id: q.id,
        subjectId: dto.subject_id,
        title: q.title,
        status: Q_STATUS_MAP[dto.status] ?? 'ready',
        difficulty: DIFFICULTY_MAP[dto.difficulty] ?? 'Medium',
        commonPrompt: q.common_prompt,
        instructions: q.instructions,
        constraints: q.constraints,
        expectedFiles: q.expected_files,
        allowedFormat: '.zip',
        parts: q.parts
          .sort((a, b) => a.part_number - b.part_number)
          .map((p) => ({ id: `p-${p.part_number}`, label: p.label, prompt: p.prompt, marks: p.marks })),
        rubric: dto.rubric_criteria
          .sort((a, b) => a.order_index - b.order_index)
          .map((r) => ({ id: r.key, name: r.name, maxMarks: r.max_marks })),
        createdAt: dto.created_at,
      }
    : null
  return { assessment, question }
}

export function adaptScenario(dto: ScenarioDTO, opts: { questionId?: string; studentId?: string } = {}): StudentScenario {
  return {
    id: dto.id,
    scenarioCode: dto.scenario_code,
    studentId: dto.student_id ?? opts.studentId ?? '',
    questionId: opts.questionId ?? '',
    title: dto.title,
    domain: dto.domain,
    narrative: dto.scenario_text,
    entities: dto.scenario_variables?.entities ?? [],
    sampleRecords: dto.scenario_variables?.sample_records_note ?? '',
  }
}

function fileKind(name: string): SubmissionFile['kind'] {
  if (name.endsWith('.sql')) return 'sql'
  if (name.endsWith('.md')) return 'md'
  if (name.endsWith('.txt')) return 'txt'
  if (name.endsWith('.json')) return 'json'
  if (/\.(py|js|ts|java|cpp|c|go|rb)$/.test(name)) return 'code'
  return 'other'
}

const AI_ACTIVE = ['QUEUED', 'EXTRACTING', 'FILE_ANALYSIS', 'SYNTAX_CHECK', 'TEST_CASES', 'LOGIC_ANALYSIS', 'RUBRIC_ANALYSIS', 'AI_CONTENT_ANALYSIS', 'SCORING', 'REPORT_GENERATION']

export function submissionStage(dto: SubmissionDTO): SubmissionStage {
  if (dto.ai_published) return 'published'
  if (dto.ai_stage === 'COMPLETED') return 'evaluator_review'
  if (dto.ai_stage && AI_ACTIVE.includes(dto.ai_stage)) return 'ai_evaluation'
  if (dto.status === 'SUBMITTED') return 'sent_to_evaluator'
  if (dto.status === 'READY' || dto.files.length > 0) return 'uploaded'
  return 'not_started'
}

export function adaptSubmission(dto: SubmissionDTO): Submission {
  return {
    id: dto.id,
    assessmentId: dto.assessment_id,
    studentId: dto.student_id,
    scenarioId: dto.scenario_id ?? '',
    zipName: dto.original_filename,
    zipSizeMB: Number((dto.size_bytes / 1024 / 1024).toFixed(1)),
    files: dto.files.map((f) => ({
      name: f.filename,
      path: f.path,
      sizeKB: Number((f.size_bytes / 1024).toFixed(1)),
      kind: fileKind(f.filename),
    })),
    submittedAt: dto.submitted_at,
    stage: submissionStage(dto),
    aiEvaluationId: dto.ai_evaluation_id,
    aiScore: dto.ai_score ?? null,
    manualEvaluationId: dto.manual_status ? `m-${dto.id}` : null,
    manualStatus: (dto.manual_status?.toLowerCase() as Submission['manualStatus']) ?? null,
    published: dto.ai_published,
    studentName: dto.student_name ?? undefined,
    studentCode: dto.student_code ?? undefined,
    assessmentTitle: dto.assessment_title ?? undefined,
  }
}

export function scenarioFromSubmission(dto: SubmissionDTO): StudentScenario | null {
  if (!dto.scenario_id || !dto.scenario_text) return null
  return {
    id: dto.scenario_id,
    scenarioCode: dto.scenario_code ?? '',
    studentId: dto.student_id,
    questionId: '',
    title: dto.scenario_title ?? '',
    domain: dto.scenario_domain ?? '',
    narrative: dto.scenario_text ?? '',
    entities: dto.scenario_entities ?? [],
    sampleRecords: '',
  }
}

const STAGE_INDEX: Record<string, number> = {
  QUEUED: 0,
  EXTRACTING: 1,
  FILE_ANALYSIS: 2,
  SYNTAX_CHECK: 4,
  TEST_CASES: 5,
  LOGIC_ANALYSIS: 6,
  RUBRIC_ANALYSIS: 7,
  AI_CONTENT_ANALYSIS: 8,
  SCORING: 9,
  REPORT_GENERATION: 9,
  COMPLETED: 10,
  PUBLISHED: 10,
  FAILED: -1,
}

const CLASS_MAP = { LOW: 'Low Probability', MODERATE: 'Moderate Probability', HIGH: 'High Probability' } as const

export function adaptAIEvaluation(dto: AIEvaluationDTO): AIEvaluation {
  const done = dto.stage === 'COMPLETED' || dto.stage === 'PUBLISHED'
  return {
    id: dto.id,
    submissionId: dto.submission_id,
    status: dto.stage === 'FAILED' ? 'failed' : done ? 'completed' : 'in_progress',
    currentStageIndex: STAGE_INDEX[dto.stage] ?? 0,
    score: Math.round(dto.overall_score),
    maxScore: Math.round(dto.max_score) || 100,
    confidence: Math.round(dto.confidence * 100),
    aiContentProbability: Math.round(dto.ai_content_probability * 100),
    aiContentClassification: CLASS_MAP[dto.ai_content_classification] ?? 'Low Probability',
    rubric: dto.rubric_scores.map((r) => ({ name: r.name, score: r.score, maxScore: r.max_score })),
    testCases: dto.test_cases.map(
      (t): AITestCase => ({
        id: t.code,
        name: t.name,
        description: t.description,
        expected: t.expected,
        actual: t.actual,
        passed: t.passed,
        score: t.score,
        maxScore: t.max_score,
        explanation: t.explanation,
      }),
    ),
    strengths: dto.strengths,
    issues: dto.weaknesses,
    recommendations: dto.recommendations,
    summary: dto.explanation,
    completedAt: dto.completed_at,
  }
}

export function adaptManual(dto: ManualEvaluationDTO): ManualEvaluation {
  return {
    id: dto.id,
    submissionId: dto.submission_id,
    evaluatorId: dto.evaluator_id,
    status: dto.status.toLowerCase() as ManualEvaluation['status'],
    scores: dto.scores,
    comments: dto.comments,
    strengths: dto.strengths,
    improvements: dto.improvements,
    total: dto.total,
    maxTotal: dto.max_total,
    updatedAt: dto.updated_at,
  }
}

export function adaptProject(dto: ProjectDTO): Project {
  return {
    id: dto.id,
    title: dto.title,
    brief: dto.brief,
    deadline: dto.deadline ?? '',
    expectedFiles: [...dto.required_files, ...dto.optional_files],
    assignedEvaluatorId: '',
  }
}

const PROJ_ACTIVE = AI_ACTIVE
export function adaptProjectSubmission(
  dto: ProjectSubmissionDTO,
  evaluation?: ProjectEvaluationDTO | null,
): ProjectSubmission {
  const evStage = evaluation?.stage ?? dto.evaluation_stage ?? null
  const evPublished = evaluation?.published ?? dto.evaluation_published ?? false
  const evId = evaluation?.id ?? dto.evaluation_id ?? null

  let stage: ProjectSubmission['stage'] = 'not_started'
  if (evPublished) stage = 'published'
  else if (evStage === 'COMPLETED') stage = 'evaluator_review'
  else if (evStage && PROJ_ACTIVE.includes(evStage)) stage = 'ai_evaluation'
  else if (dto.status === 'SUBMITTED') stage = 'submitted'
  else if (dto.status === 'READY' || dto.status === 'UPLOADED') stage = 'uploaded'
  return {
    id: dto.id,
    projectId: dto.project_id,
    studentId: dto.student_id,
    zipName: dto.original_filename,
    zipSizeMB: Number((dto.size_bytes / 1024 / 1024).toFixed(1)),
    detectedStructure: dto.detected_structure,
    submittedAt: dto.submitted_at,
    stage,
    evaluationId: evId,
    published: evPublished,
  }
}

export function adaptProjectEvaluation(dto: ProjectEvaluationDTO): ProjectEvaluation {
  const done = dto.stage === 'COMPLETED' || dto.stage === 'PUBLISHED'
  return {
    id: dto.id,
    projectSubmissionId: dto.submission_id,
    status: dto.stage === 'FAILED' ? 'failed' : done ? 'completed' : 'in_progress',
    currentStageIndex: STAGE_INDEX[dto.stage] ?? 0,
    score: Math.round(dto.overall_score),
    maxScore: Math.round(dto.max_score) || 100,
    confidence: Math.round(dto.confidence * 100),
    aiContentProbability: Math.round(dto.ai_content_probability * 100),
    aiContentClassification: CLASS_MAP[dto.ai_content_classification] ?? 'Low Probability',
    rubric: dto.rubric_scores.map((r) => ({ name: r.name, score: r.score, maxScore: r.max_score })),
    checks: dto.checks,
    strengths: dto.strengths,
    issues: dto.weaknesses,
    recommendations: dto.recommendations,
    summary: dto.explanation,
    completedAt: dto.completed_at,
  }
}

const CLASS_FROM_UPPER: Record<string, AIEvaluation['aiContentClassification']> = {
  LOW: 'Low Probability',
  MODERATE: 'Moderate Probability',
  HIGH: 'High Probability',
}

/** Student-facing published assessment result dict -> AIEvaluation */
export function adaptResultDictToAI(d: Record<string, unknown>): AIEvaluation {
  const aic = (d.ai_content ?? {}) as Record<string, unknown>
  const rubric = (d.rubric_scores ?? []) as { name: string; score: number; max_score: number }[]
  const tcs = (d.test_cases ?? []) as Record<string, unknown>[]
  return {
    id: String(d.submission_id),
    submissionId: String(d.submission_id),
    status: 'completed',
    currentStageIndex: 10,
    score: Math.round(Number(d.ai_score) || 0),
    maxScore: Math.round(Number(d.max_score) || 100),
    confidence: Math.round((Number(d.confidence) || 0) * 100),
    aiContentProbability: Math.round((Number(aic.estimated_probability) || 0) * 100),
    aiContentClassification: CLASS_FROM_UPPER[String(aic.classification)] ?? 'Low Probability',
    rubric: rubric.map((r) => ({ name: r.name, score: r.score, maxScore: r.max_score })),
    testCases: tcs.map((t) => ({
      id: String(t.code),
      name: String(t.name),
      description: String(t.description ?? ''),
      expected: String(t.expected ?? ''),
      actual: String(t.actual ?? ''),
      passed: Boolean(t.passed),
      score: Number(t.score) || 0,
      maxScore: Number(t.max_score) || 0,
      explanation: String(t.explanation ?? ''),
    })),
    strengths: (d.strengths ?? []) as string[],
    issues: (d.weaknesses ?? []) as string[],
    recommendations: (d.recommendations ?? []) as string[],
    summary: String(d.explanation ?? ''),
    completedAt: (d.published_at as string) ?? null,
  }
}

export function adaptResultDictToProject(d: Record<string, unknown>): ProjectEvaluation {
  const aic = (d.ai_content ?? {}) as Record<string, unknown>
  const rubric = (d.rubric_scores ?? []) as { name: string; score: number; max_score: number }[]
  return {
    id: String(d.submission_id),
    projectSubmissionId: String(d.submission_id),
    status: 'completed',
    currentStageIndex: 9,
    score: Math.round(Number(d.ai_score) || 0),
    maxScore: Math.round(Number(d.max_score) || 100),
    confidence: Math.round((Number(d.confidence) || 0) * 100),
    aiContentProbability: Math.round((Number(aic.estimated_probability) || 0) * 100),
    aiContentClassification: CLASS_FROM_UPPER[String(aic.classification)] ?? 'Low Probability',
    rubric: rubric.map((r) => ({ name: r.name, score: r.score, maxScore: r.max_score })),
    checks: (d.checks ?? []) as { name: string; passed: boolean; detail: string }[],
    strengths: (d.strengths ?? []) as string[],
    issues: (d.weaknesses ?? []) as string[],
    recommendations: (d.recommendations ?? []) as string[],
    summary: String(d.explanation ?? ''),
    completedAt: null,
  }
}

const NOTIF_KIND: Record<string, Notification['kind']> = {
  ASSESSMENT_PUBLISHED: 'publish',
  SUBMISSION_RECEIVED: 'submission',
  AI_EVALUATION_COMPLETED: 'ai',
  RESULT_PUBLISHED: 'publish',
  PROJECT_SUBMITTED: 'project',
  PROJECT_RESULT_PUBLISHED: 'project',
  SYSTEM: 'system',
}

export function adaptNotification(dto: NotificationDTO, role: Role, userId: string): Notification {
  return {
    id: dto.id,
    role,
    userId,
    title: dto.title,
    body: dto.message,
    createdAt: dto.created_at,
    read: dto.is_read,
    kind: NOTIF_KIND[dto.type] ?? 'system',
  }
}
