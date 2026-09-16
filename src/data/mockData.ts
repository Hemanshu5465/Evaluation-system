/**
 * UI constants only. All real data comes from the backend API.
 *
 * `demoAccounts` matches `backend/scripts/seed.py` — used to pre-fill the login
 * form during local demos. In a real deployment you'd remove these or replace
 * them with your own onboarding.
 */

export const demoAccounts = [
  { role: 'admin' as const, identifier: 'admin@example.com', password: 'demo1234', name: 'Dr. Anjali Mehta' },
  { role: 'evaluator' as const, identifier: 'evaluator@example.com', password: 'demo1234', name: 'Prof. Sameer Rao' },
  // first row of the LJ roster — enrollment login, password = last 7 digits
  { role: 'student' as const, identifier: '25004406110001', password: '6110001', name: 'Laliwala Munib Mazar' },
]

/** Stage labels for the animated AI-evaluation pipeline (maps to backend EvaluationStage). */
export const AI_STAGES = [
  'Uploading ZIP',
  'Extracting Files',
  'Checking File Structure',
  'Reading Solution',
  'Checking Syntax',
  'Running Test Cases',
  'Checking Logic',
  'Checking Requirements',
  'Checking AI-Generated Probability',
  'Generating Evaluation Report',
  'Evaluation Complete',
]

export const PROJECT_AI_STAGES = [
  'Uploading ZIP',
  'Extracting Files',
  'Mapping Project Structure',
  'Reading Documentation',
  'Analyzing Source Code',
  'Checking Database Script',
  'Scanning Dependencies',
  'Running Quality & Security Checks',
  'Checking AI-Generated Probability',
  'Generating Evaluation Report',
]
