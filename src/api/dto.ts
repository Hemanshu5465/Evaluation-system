// Backend response shapes (snake_case). Only the fields the frontend consumes.

export interface UserDTO {
  id: string
  name: string
  email: string
  role: 'ADMIN' | 'EVALUATOR' | 'STUDENT'
  student_id: string | null
  department: string | null
  is_active: boolean
  created_at: string
}

export interface TokenDTO {
  access_token: string
  refresh_token: string
  token_type: string
  expires_at: string
  user: UserDTO
}

export interface SyllabusTopicDTO {
  id: string
  name: string
  subtopics: string[]
  order_index: number
}

export interface SyllabusDTO {
  id: string
  title: string
  description: string
  difficulty: string
  source_filename: string
  processing_status: 'UPLOADED' | 'PROCESSING' | 'PROCESSED' | 'FAILED'
  processing_error: string | null
  learning_outcomes: string[]
  topics: SyllabusTopicDTO[]
  created_at: string
  updated_at: string
}

export interface SyllabusAnalysisDTO {
  subject_id: string
  subject_name: string
  subject_code: string
  semester: string
  description: string
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  topics: string[]
  learning_outcomes: string[]
}

export interface SubjectDTO {
  id: string
  name: string
  code: string
  semester?: string
  description: string
  is_active: boolean
  created_at: string
  syllabus: SyllabusDTO | null
}

export interface QuestionPartDTO {
  part_number: number
  label: string
  prompt: string
  expected_concept: string
  marks: number
}

export interface RubricCriterionDTO {
  key: string
  name: string
  max_marks: number
  order_index: number
}

export interface QuestionDTO {
  id: string
  title: string
  common_prompt: string
  instructions: string[]
  constraints: string[]
  expected_files: string[]
  learning_objectives: string[]
  parts: QuestionPartDTO[]
}

export interface AssessmentDTO {
  id: string
  title: string
  subject_id: string
  subject_name: string | null
  status: 'DRAFT' | 'GENERATING' | 'READY' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED'
  difficulty: 'EASY' | 'MEDIUM' | 'HARD'
  deadline: string | null
  published_at: string | null
  generation_error: string | null
  created_at: string
  question: QuestionDTO | null
  rubric_criteria: RubricCriterionDTO[]
  evaluator_ids: string[]
  student_ids: string[]
  scenario_count: number
  duration_minutes: number | null
  started_at: string | null
  expires_at: string | null
}

export interface ScenarioDTO {
  id: string
  student_id: string | null
  scenario_code: string
  title: string
  domain: string
  scenario_text: string
  scenario_variables: { entities?: { name: string; columns: string[] }[]; sample_records_note?: string }
  prompt_version: string
  student_name?: string | null
  student_code?: string | null
}

export interface SubmissionFileDTO {
  path: string
  filename: string
  extension: string
  size_bytes: number
  mime_type: string
  sha256: string
  is_text: boolean
}

export interface SubmissionDTO {
  id: string
  assessment_id: string
  student_id: string
  original_filename: string
  size_bytes: number
  sha256: string
  status: 'UPLOADED' | 'VALIDATING' | 'READY' | 'SUBMITTED' | 'REJECTED'
  version: number
  attempt_number: number
  submitted_at: string | null
  locked: boolean
  created_at: string
  files: SubmissionFileDTO[]
  assessment_title: string | null
  subject_name: string | null
  student_name: string | null
  student_code: string | null
  scenario_id: string | null
  ai_evaluation_id: string | null
  ai_stage: string | null
  ai_progress: number | null
  ai_score: number | null
  ai_published: boolean
  manual_status: 'PENDING' | 'DRAFT' | 'COMPLETED' | null
  scenario_code: string | null
  scenario_title: string | null
  scenario_domain: string | null
  scenario_text: string | null
  scenario_entities: { name: string; columns: string[] }[]
  manual_evaluation: ManualEvaluationDTO | null
}

export interface AITestCaseDTO {
  code: string
  name: string
  category: string
  description: string
  expected: string
  actual: string
  passed: boolean
  score: number
  max_score: number
  explanation: string
  evidence: string[]
}

export interface AIEvaluationDTO {
  id: string
  submission_id: string
  version: number
  stage: string
  progress: number
  stage_history: { stage: string; at: string }[]
  error: string | null
  overall_score: number
  max_score: number
  confidence: number
  rubric_scores: { key: string; name: string; score: number; max_score: number; evidence: string[] }[]
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  explanation: string
  ai_content_probability: number
  ai_content_classification: 'LOW' | 'MODERATE' | 'HIGH'
  ai_content_confidence: number
  ai_content_evidence: string[]
  provider: string
  prompt_version: string
  published: boolean
  published_at: string | null
  completed_at: string | null
  test_cases: AITestCaseDTO[]
}

export interface ManualEvaluationDTO {
  id: string
  submission_id: string
  evaluator_id: string
  status: 'PENDING' | 'DRAFT' | 'COMPLETED'
  scores: Record<string, number>
  total: number
  max_total: number
  comments: string
  strengths: string
  improvements: string
  submitted_at: string | null
  updated_at: string
}

export interface ProjectDTO {
  id: string
  title: string
  brief: string
  deadline: string | null
  required_files: string[]
  optional_files: string[]
  rubric: { key: string; name: string; max_marks: number }[]
  is_active: boolean
  created_at: string
}

export interface ProjectSubmissionDTO {
  id: string
  project_id: string
  student_id: string
  original_filename: string
  size_bytes: number
  status: string
  validation_error: string | null
  detected_structure: { path: string; type: 'file' | 'dir'; present: boolean }[]
  submitted_at: string | null
  locked: boolean
  created_at: string
  project_title?: string | null
  student_name?: string | null
  student_code?: string | null
  evaluation_id?: string | null
  evaluation_stage?: string | null
  evaluation_score?: number | null
  evaluation_published?: boolean
}

export interface ProjectEvaluationDTO {
  id: string
  submission_id: string
  version: number
  stage: string
  progress: number
  stage_history: { stage: string; at: string }[]
  error: string | null
  overall_score: number
  max_score: number
  confidence: number
  rubric_scores: { key: string; name: string; score: number; max_score: number }[]
  checks: { name: string; passed: boolean; detail: string }[]
  strengths: string[]
  weaknesses: string[]
  recommendations: string[]
  explanation: string
  ai_content_probability: number
  ai_content_classification: 'LOW' | 'MODERATE' | 'HIGH'
  published: boolean
  completed_at: string | null
}

export interface NotificationDTO {
  id: string
  title: string
  message: string
  type: string
  entity_type: string | null
  entity_id: string | null
  is_read: boolean
  created_at: string
}

export interface JobDTO {
  id: string
  kind: string
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number
  stage: string
  entity_type: string | null
  entity_id: string | null
  result: Record<string, unknown>
  error: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface StartEvalDTO {
  evaluation_id: string
  job_id: string | null
  status: string
}

export interface PageDTO<T> {
  items: T[]
  page: number
  page_size: number
  total: number
  total_pages: number
}
