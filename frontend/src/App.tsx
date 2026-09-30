import { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, Role, useAuth } from './auth';
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
import LeaveAdminPage from './pages/leave/LeaveAdminPage';
import TimesheetPage from './pages/attendance/TimesheetPage';
import OvertimeAdminPage from './pages/attendance/OvertimeAdminPage';
import HolidaysPage from './pages/attendance/HolidaysPage';
import MyOvertimePage from './pages/me/MyOvertimePage';
import { MyApprovalsPage, MyTeamPage } from './pages/me/ManagerPages';
import RecruitmentPage from './pages/recruitment/RecruitmentPage';
import OpeningDetailPage from './pages/recruitment/OpeningDetailPage';
import UsersPage from './pages/UsersPage';
import ImportPage from './pages/ImportPage';
import AuditPage from './pages/AuditPage';
import SettingsPage from './pages/SettingsPage';
import LegalParamsPage from './pages/LegalParamsPage';
import MyProfilePage from './pages/me/MyProfilePage';
import MyAttendancePage from './pages/me/MyAttendancePage';
import MyLeavePage from './pages/me/MyLeavePage';
import MyPayslipsPage from './pages/me/MyPayslipsPage';

const STAFF: Role[] = ['ADMIN', 'HR', 'ACCOUNTANT'];

/** Chặn trang theo vai trò; không đủ quyền thì về Dashboard. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
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
  const staff = (el: ReactNode) => <RequireRole roles={STAFF}>{el}</RequireRole>;

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

        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="persons" element={staff(<PersonsPage />)} />
        <Route path="persons/:id" element={staff(<PersonDetailPage />)} />
        <Route path="org" element={staff(<OrgPage />)} />
        <Route path="attendance" element={staff(<TimesheetPage />)} />
        <Route path="leave" element={staff(<LeaveAdminPage />)} />
        <Route path="overtime" element={staff(<OvertimeAdminPage />)} />
        <Route path="holidays" element={staff(<HolidaysPage />)} />
        <Route path="payroll" element={staff(<PayrollPage />)} />
        <Route path="payroll/:id" element={staff(<PeriodDetailPage />)} />
        <Route
          path="recruitment"
          element={<RequireRole roles={['ADMIN', 'HR']}><RecruitmentPage /></RequireRole>}
        />
        <Route
          path="recruitment/:id"
          element={<RequireRole roles={['ADMIN', 'HR']}><OpeningDetailPage /></RequireRole>}
        />
        <Route path="import" element={<RequireRole roles={['ADMIN', 'HR', 'ACCOUNTANT']}><ImportPage /></RequireRole>} />
        <Route path="settings/legal" element={<RequireRole roles={['ADMIN']}><LegalParamsPage /></RequireRole>} />
        <Route path="settings" element={<RequireRole roles={['ADMIN']}><SettingsPage /></RequireRole>} />
        <Route path="audit" element={<RequireRole roles={['ADMIN']}><AuditPage /></RequireRole>} />
        <Route path="users" element={<RequireRole roles={['ADMIN']}><UsersPage /></RequireRole>} />
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
