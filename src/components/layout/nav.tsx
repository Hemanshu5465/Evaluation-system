import type { Role } from '@/types'
import {
  BarChart3,
  ClipboardCheck,
  FileStack,
  FolderGit2,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Settings,
  Sparkles,
  UserCog,
  Users,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
}

export const NAV: Record<Role, NavItem[]> = {
  admin: [
    { label: 'Workspace', to: '/admin', icon: Sparkles },
    { label: 'Dashboard', to: '/admin/overview', icon: LayoutDashboard },
    { label: 'Questions', to: '/admin/questions', icon: ListChecks },
    { label: 'Students', to: '/admin/students', icon: GraduationCap },
    { label: 'Evaluators', to: '/admin/evaluators', icon: UserCog },
    { label: 'Assignments', to: '/admin/assignments', icon: Workflow },
    { label: 'Submissions', to: '/admin/submissions', icon: FileStack },
    { label: 'Analytics', to: '/admin/analytics', icon: BarChart3 },
    { label: 'Settings', to: '/admin/settings', icon: Settings },
  ],
  evaluator: [
    { label: 'Dashboard', to: '/evaluator', icon: LayoutDashboard },
    { label: 'Assigned Assessments', to: '/evaluator/assigned', icon: ClipboardCheck },
    { label: 'Student Submissions', to: '/evaluator/submissions', icon: FileStack },
    { label: 'AI Evaluations', to: '/evaluator/ai-evaluations', icon: Sparkles },
    { label: 'Manual Evaluations', to: '/evaluator/manual', icon: ListChecks },
    { label: 'Project Evaluations', to: '/evaluator/projects', icon: FolderGit2 },
    { label: 'Published Results', to: '/evaluator/published', icon: BarChart3 },
    { label: 'Analytics', to: '/evaluator/analytics', icon: BarChart3 },
  ],
  student: [
    { label: 'Dashboard', to: '/student', icon: LayoutDashboard },
    { label: 'My Assessments', to: '/student/assessments', icon: ClipboardCheck },
    { label: 'Project Evaluation', to: '/student/project', icon: FolderGit2 },
    { label: 'Submissions', to: '/student/submissions', icon: FileStack },
    { label: 'Results', to: '/student/results', icon: BarChart3 },
    { label: 'Profile', to: '/student/profile', icon: Users },
  ],
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrator',
  evaluator: 'Evaluator',
  student: 'Student',
}
