import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { Role } from '@/types'
import { authService } from '@/services/authService'
import { useStore } from '@/store/store'
import { AppShell } from '@/components/layout/AppShell'
import { Toaster } from '@/components/ui/Toaster'

import { LoginPage } from '@/pages/auth/LoginPage'

import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { WorkspacePage } from '@/pages/admin/WorkspacePage'
import { QuestionsPage } from '@/pages/admin/QuestionsPage'
import { StudentsPage } from '@/pages/admin/StudentsPage'
import { EvaluatorsPage } from '@/pages/admin/EvaluatorsPage'
import { AssignmentsPage } from '@/pages/admin/AssignmentsPage'
import { AdminSubmissionsPage } from '@/pages/admin/AdminSubmissionsPage'
import { AnalyticsPage } from '@/pages/admin/AnalyticsPage'
import { SettingsPage } from '@/pages/admin/SettingsPage'

import { EvaluatorDashboard } from '@/pages/evaluator/EvaluatorDashboard'
import { AssignedPage } from '@/pages/evaluator/AssignedPage'
import { EvaluatorSubmissionsPage } from '@/pages/evaluator/EvaluatorSubmissionsPage'
import { SubmissionDetailPage } from '@/pages/evaluator/SubmissionDetailPage'
import { AIEvaluationsPage } from '@/pages/evaluator/AIEvaluationsPage'
import { ManualEvaluationsPage } from '@/pages/evaluator/ManualEvaluationsPage'
import { ManualEvaluationPage } from '@/pages/evaluator/ManualEvaluationPage'
import { ProjectEvaluationsPage } from '@/pages/evaluator/ProjectEvaluationsPage'
import { PublishedResultsPage } from '@/pages/evaluator/PublishedResultsPage'
import { EvaluatorAnalyticsPage } from '@/pages/evaluator/EvaluatorAnalyticsPage'

import { StudentDashboard } from '@/pages/student/StudentDashboard'
import { StudentAssessmentsPage } from '@/pages/student/StudentAssessmentsPage'
import { AssessmentPage } from '@/pages/student/AssessmentPage'
import { StudentProjectPage } from '@/pages/student/StudentProjectPage'
import { StudentSubmissionsPage } from '@/pages/student/StudentSubmissionsPage'
import { ResultsPage } from '@/pages/student/ResultsPage'
import { ProfilePage } from '@/pages/student/ProfilePage'

function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const user = useStore((s) => s.currentUser)
  const location = useLocation()
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />
  return <>{children}</>
}

export default function App() {
  const user = useStore((s) => s.currentUser)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    authService.restore().finally(() => setRestored(true))
  }, [])

  if (!restored)
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-ink-muted">
        Loading EvalAI…
      </div>
    )

  return (
    <>
      <Routes>
        <Route path="/login" element={user ? <Navigate to={`/${user.role}`} replace /> : <LoginPage />} />

        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <AppShell />
            </RequireRole>
          }
        >
          <Route index element={<WorkspacePage />} />
          <Route path="overview" element={<AdminDashboard />} />
          <Route path="questions" element={<QuestionsPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="evaluators" element={<EvaluatorsPage />} />
          <Route path="assignments" element={<AssignmentsPage />} />
          <Route path="submissions" element={<AdminSubmissionsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        <Route
          path="/evaluator"
          element={
            <RequireRole role="evaluator">
              <AppShell />
            </RequireRole>
          }
        >
          <Route index element={<EvaluatorDashboard />} />
          <Route path="assigned" element={<AssignedPage />} />
          <Route path="submissions" element={<EvaluatorSubmissionsPage />} />
          <Route path="submissions/:id" element={<SubmissionDetailPage />} />
          <Route path="ai-evaluations" element={<AIEvaluationsPage />} />
          <Route path="manual" element={<ManualEvaluationsPage />} />
          <Route path="manual/:id" element={<ManualEvaluationPage />} />
          <Route path="projects" element={<ProjectEvaluationsPage />} />
          <Route path="published" element={<PublishedResultsPage />} />
          <Route path="analytics" element={<EvaluatorAnalyticsPage />} />
        </Route>

        <Route
          path="/student"
          element={
            <RequireRole role="student">
              <AppShell />
            </RequireRole>
          }
        >
          <Route index element={<StudentDashboard />} />
          <Route path="assessments" element={<StudentAssessmentsPage />} />
          <Route path="assessments/:id" element={<AssessmentPage />} />
          <Route path="project" element={<StudentProjectPage />} />
          <Route path="submissions" element={<StudentSubmissionsPage />} />
          <Route path="results" element={<ResultsPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to={user ? `/${user.role}` : '/login'} replace />} />
      </Routes>
      <Toaster />
    </>
  )
}
