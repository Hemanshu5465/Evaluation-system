export type Role = 'admin' | 'evaluator' | 'student'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  avatarColor: string
}

export interface Student extends User {
  role: 'student'
  studentCode: string
  program?: string
  year?: number
}

export interface Evaluator extends User {
  role: 'evaluator'
  department: string
  assignedStudentIds: string[]
}

export interface Admin extends User {
  role: 'admin'
  title: string
}

export type SyllabusStatus = 'not_configured' | 'processing' | 'ready'

export interface Syllabus {
  id: string
  fileName: string
  fileType: 'PDF' | 'DOCX' | 'TXT'
  sizeMB: number
  uploadedAt: string
  status: SyllabusStatus
  progress: number
  topics: string[]
  learningOutcomes: string[]
}

export interface Subject {
  id: string
  slot: 1 | 2 | 3
  name: string
  code: string
  semester: string
  description: string
  syllabus: Syllabus | null
}

export type QuestionStatus = 'draft' | 'generating' | 'ready' | 'published'

export interface QuestionPart {
  id: string
  label: string
  prompt: string
  marks: number
}

export interface RubricCriterion {
  id: string
  name: string
  maxMarks: number
}

export interface Question {
  id: string
  subjectId: string
  title: string
  status: QuestionStatus
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Advanced'
  commonPrompt: string
  instructions: string[]
  constraints: string[]
  expectedFiles: string[]
  allowedFormat: string
  parts: QuestionPart[]
  rubric: RubricCriterion[]
  createdAt: string
}

export interface StudentScenario {
  id: string
  scenarioCode: string
  studentId: string
  questionId: string
  title: string
  domain: string
  narrative: string
  entities: { name: string; columns: string[] }[]
  sampleRecords: string
}

export type AssessmentStatus = 'draft' | 'published' | 'closed'

export interface Assessment {
  id: string
  title: string
  subjectId: string
  subjectName: string
  questionId: string
  type: 'scenario'
  status: AssessmentStatus
  deadline: string
  createdAt: string
  assignedEvaluatorId: string
  studentIds: string[]
  /** Per-question time limit set by the admin at publish time. Null = no timer. */
  durationMinutes: number | null
  /** This student's personal countdown — set the first time they open the question. */
  startedAt: string | null
  expiresAt: string | null
}

export type SubmissionStage =
  | 'not_started'
  | 'uploaded'
  | 'submitted'
  | 'sent_to_evaluator'
  | 'ai_evaluation'
  | 'evaluator_review'
  | 'published'

export interface SubmissionFile {
  name: string
  path: string
  sizeKB: number
  kind: 'sql' | 'txt' | 'md' | 'json' | 'code' | 'other'
}

export interface Submission {
  id: string
  assessmentId: string
  studentId: string
  scenarioId: string
  zipName: string
  zipSizeMB: number
  files: SubmissionFile[]
  submittedAt: string | null
  stage: SubmissionStage
  aiEvaluationId: string | null
  aiScore: number | null
  manualEvaluationId: string | null
  manualStatus: ManualEvaluationStatus | null
  published: boolean
  studentName?: string
  studentCode?: string
  assessmentTitle?: string
}

export type AIEvaluationStatus = 'not_started' | 'in_progress' | 'completed' | 'failed'

export interface AITestCase {
  id: string
  name: string
  description: string
  expected: string
  actual: string
  passed: boolean
  score: number
  maxScore: number
  explanation: string
}

export interface AIRubricLine {
  name: string
  score: number
  maxScore: number
}

export interface AIEvaluation {
  id: string
  submissionId: string
  status: AIEvaluationStatus
  currentStageIndex: number
  score: number
  maxScore: number
  confidence: number
  aiContentProbability: number
  aiContentClassification: 'Low Probability' | 'Moderate Probability' | 'High Probability'
  rubric: AIRubricLine[]
  testCases: AITestCase[]
  strengths: string[]
  issues: string[]
  recommendations: string[]
  summary: string
  completedAt: string | null
}

export type ManualEvaluationStatus = 'pending' | 'draft' | 'completed'

export interface ManualEvaluation {
  id: string
  submissionId: string
  evaluatorId: string
  status: ManualEvaluationStatus
  scores: Record<string, number>
  comments: string
  strengths: string
  improvements: string
  total: number
  maxTotal: number
  updatedAt: string
}

export type ProjectStage =
  | 'not_started'
  | 'uploaded'
  | 'submitted'
  | 'ai_evaluation'
  | 'evaluator_review'
  | 'published'

export interface Project {
  id: string
  title: string
  brief: string
  deadline: string
  expectedFiles: string[]
  assignedEvaluatorId: string
}

export interface ProjectSubmission {
  id: string
  projectId: string
  studentId: string
  zipName: string
  zipSizeMB: number
  detectedStructure: { path: string; type: 'file' | 'dir'; present: boolean }[]
  submittedAt: string | null
  stage: ProjectStage
  evaluationId: string | null
  published: boolean
}

export interface ProjectEvaluation {
  id: string
  projectSubmissionId: string
  status: AIEvaluationStatus
  currentStageIndex: number
  score: number
  maxScore: number
  confidence: number
  aiContentProbability: number
  aiContentClassification: 'Low Probability' | 'Moderate Probability' | 'High Probability'
  rubric: AIRubricLine[]
  checks: { name: string; passed: boolean; detail: string }[]
  strengths: string[]
  issues: string[]
  recommendations: string[]
  summary: string
  completedAt: string | null
}

export interface Notification {
  id: string
  role: Role
  userId: string | null
  title: string
  body: string
  createdAt: string
  read: boolean
  kind: 'submission' | 'ai' | 'publish' | 'syllabus' | 'project' | 'system'
}

export interface Toast {
  id: string
  kind: 'success' | 'error' | 'info' | 'warning'
  title: string
  message?: string
}
