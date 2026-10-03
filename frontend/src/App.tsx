import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, can, Module, useAuth } from './auth';
import { ToastProvider } from './components/ui';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/PasswordResetPages';
import ChangePasswordPage from './pages/ChangePasswordPage';
import DashboardPage from './pages/DashboardPage';
import PersonsPage from './pages/persons/PersonsPage';
import PersonDetailPage from './pages/persons/PersonDetailPage';
import OrgPage from './pages/org/OrgPage';
import PayrollPage from './pages/payroll/PayrollPage';
import PeriodDetailPage from './pages/payroll/PeriodDetailPage';
import ReportsPage from './pages/payroll/ReportsPage';
import ShiftsPage from './pages/attendance/ShiftsPage';
import MachineImportPage from './pages/attendance/MachineImportPage';
import RewardsPage from './pages/people/RewardsPage';
import TrainingsPage, { TrainingDetailPage } from './pages/people/TrainingsPage';
import ReviewsPage, { ReviewCyclePage } from './pages/people/ReviewsPage';
import MyReviewsPage from './pages/me/MyReviewsPage';
import BenefitsPage from './pages/people/BenefitsPage';
import AssetsPage from './pages/people/AssetsPage';
import ChecklistsPage, { ChecklistDetailPage, MyTasksPage } from './pages/people/ChecklistsPage';
import LeaveAdminPage from './pages/leave/LeaveAdminPage';
import TimesheetPage from './pages/attendance/TimesheetPage';
import OvertimeAdminPage from './pages/attendance/OvertimeAdminPage';
import HolidaysPage from './pages/attendance/HolidaysPage';
import MyOvertimePage from './pages/me/MyOvertimePage';
import { MyApprovalsPage, MyTeamPage } from './pages/me/ManagerPages';
import RecruitmentPage from './pages/recruitment/RecruitmentPage';
import OpeningDetailPage from './pages/recruitment/OpeningDetailPage';
import PermissionGroupsPage from './pages/PermissionGroupsPage';
import UsersPage from './pages/UsersPage';
import ImportPage from './pages/ImportPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import LegalParamsPage from './pages/LegalParamsPage';
import MyProfilePage from './pages/me/MyProfilePage';
import MyAttendancePage from './pages/me/MyAttendancePage';
import MyLeavePage from './pages/me/MyLeavePage';
import MyPayslipsPage from './pages/me/MyPayslipsPage';

/** Chặn trang theo quyền (nhóm quyền); không đủ quyền thì về Dashboard. */
function RequirePerm({ module, action = 'read', children }: { module: Module; action?: 'read' | 'write'; children: ReactNode }) {
  const { user } = useAuth();
  if (!can(user, module, action)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="empty" style={{ marginTop: 120 }}>Đang tải…</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="forgot-password" element={<ForgotPasswordPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  if (user.mustChangePassword) {
    return (
      <div className="container py-5">
        <ChangePasswordPage forced />
      </div>
    );
  }

  const home = '/dashboard';
  const P = (module: Module, el: ReactNode, action: 'read' | 'write' = 'read') => <RequirePerm module={module} action={action}>{el}</RequirePerm>;

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to={home} replace />} />
        <Route path="change-password" element={<ChangePasswordPage />} />

        <Route path="me" element={<MyProfilePage />} />
        <Route path="me/attendance" element={<MyAttendancePage />} />
        <Route path="me/leave" element={<MyLeavePage />} />
        <Route path="me/payslips" element={<MyPayslipsPage />} />
        <Route path="me/overtime" element={<MyOvertimePage />} />
        <Route path="me/approvals" element={<MyApprovalsPage />} />
        <Route path="me/team" element={<MyTeamPage />} />
        <Route path="me/reviews" element={<MyReviewsPage />} />
        <Route path="me/tasks" element={<MyTasksPage />} />
        <Route path="tasks/:id" element={<ChecklistDetailPage />} />

        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="persons" element={P('corehr', <PersonsPage />)} />
        <Route path="persons/:id" element={P('corehr', <PersonDetailPage />)} />
        <Route path="org" element={P('corehr', <OrgPage />)} />
        <Route path="attendance" element={P('attendance', <TimesheetPage />)} />
        <Route path="leave" element={P('leave', <LeaveAdminPage />)} />
        <Route path="overtime" element={P('attendance', <OvertimeAdminPage />)} />
        <Route path="holidays" element={P('attendance', <HolidaysPage />)} />
        <Route path="shifts" element={P('attendance', <ShiftsPage />)} />
        <Route path="attendance/machine" element={P('attendance', <MachineImportPage />, 'write')} />
        <Route path="rewards" element={P('people', <RewardsPage />)} />
        <Route path="checklists" element={P('checklists', <ChecklistsPage />)} />
        <Route path="assets" element={P('assets', <AssetsPage />)} />
        <Route path="benefits" element={P('benefits', <BenefitsPage />)} />
        <Route path="trainings" element={P('people', <TrainingsPage />)} />
        <Route path="trainings/:id" element={P('people', <TrainingDetailPage />)} />
        <Route path="reviews" element={P('people', <ReviewsPage />)} />
        <Route path="reviews/:id" element={P('people', <ReviewCyclePage />)} />
        <Route path="payroll" element={P('payroll', <PayrollPage />)} />
        <Route path="payroll/:id" element={P('payroll', <PeriodDetailPage />)} />
        <Route path="reports" element={P('reports', <ReportsPage />)} />
        <Route
          path="recruitment"
          element={P('recruitment', <RecruitmentPage />)}
        />
        <Route
          path="recruitment/:id"
          element={P('recruitment', <OpeningDetailPage />)}
        />
        <Route path="import" element={P('import', <ImportPage />)} />
        <Route path="settings/legal" element={P('settings', <LegalParamsPage />)} />
        <Route path="settings" element={P('settings', <SettingsPage />)} />
        <Route path="audit" element={P('audit', <AuditPage />)} />
        <Route path="users" element={P('users', <UsersPage />)} />
        <Route path="users/groups" element={user.role === 'ADMIN' ? <PermissionGroupsPage /> : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
