import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import PrivateRoute from './components/common/PrivateRoute';
import DashboardLayout from './layouts/DashboardLayout';
import LoadingSpinner from './components/common/LoadingSpinner';

const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminMembers = lazy(() => import('./pages/admin/Members'));
const AdminTrainers = lazy(() => import('./pages/admin/Trainers'));
const AdminMemberships = lazy(() => import('./pages/admin/Memberships'));
const AdminPayments = lazy(() => import('./pages/admin/Payments'));
const AdminAttendance = lazy(() => import('./pages/admin/Attendance'));
const AdminEquipment = lazy(() => import('./pages/admin/Equipment'));
const AdminAnnouncements = lazy(() => import('./pages/admin/Announcements'));
const AdminAnalytics = lazy(() => import('./pages/admin/Analytics'));
const TrainerDashboard = lazy(() => import('./pages/trainer/Dashboard'));
const TrainerMembers = lazy(() => import('./pages/trainer/Members'));
const TrainerWorkouts = lazy(() => import('./pages/trainer/Workouts'));
const TrainerAttendance = lazy(() => import('./pages/trainer/Attendance'));
const TrainerTemplates = lazy(() => import('./pages/trainer/Templates'));
const MemberAnnouncements = lazy(() => import('./pages/member/Announcements'));
const MemberDashboard = lazy(() => import('./pages/member/Dashboard'));
const MemberAttendance = lazy(() => import('./pages/member/Attendance'));
const MemberWorkouts = lazy(() => import('./pages/member/Workouts'));
const MemberDiet = lazy(() => import('./pages/member/Diet'));
const MemberGoals = lazy(() => import('./pages/member/Goals'));
const MemberProgress = lazy(() => import('./pages/member/Progress'));
const MemberMembership = lazy(() => import('./pages/member/Membership'));
const MemberPayments = lazy(() => import('./pages/member/Payments'));
const MemberProfile = lazy(() => import('./pages/member/Profile'));
const MemberNotifications = lazy(() => import('./pages/member/Notifications'));
const MemberDetail = lazy(() => import('./pages/common/MemberDetail'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <LoadingSpinner size="lg" />
    </div>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const roleRedirect = { admin: '/admin', trainer: '/trainer', member: '/member' };
  return <Navigate to={roleRedirect[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <SocketProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

          <Route
            path="/admin"
            element={
              <PrivateRoute roles={['admin']}>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="members" element={<AdminMembers />} />
            <Route path="members/:id" element={<MemberDetail />} />
            <Route path="trainers" element={<AdminTrainers />} />
            <Route path="memberships" element={<AdminMemberships />} />
            <Route path="payments" element={<AdminPayments />} />
            <Route path="attendance" element={<AdminAttendance />} />
            <Route path="equipment" element={<AdminEquipment />} />
            <Route path="announcements" element={<AdminAnnouncements />} />
            <Route path="analytics" element={<AdminAnalytics />} />
          </Route>

          <Route
            path="/trainer"
            element={
              <PrivateRoute roles={['trainer']}>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<TrainerDashboard />} />
            <Route path="members" element={<TrainerMembers />} />
            <Route path="members/:id" element={<MemberDetail />} />
            <Route path="attendance" element={<TrainerAttendance />} />
            <Route path="workouts" element={<TrainerWorkouts />} />
            <Route path="templates" element={<TrainerTemplates />} />
          </Route>

          <Route
            path="/member"
            element={
              <PrivateRoute roles={['member']}>
                <DashboardLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<MemberDashboard />} />
            <Route path="attendance" element={<MemberAttendance />} />
            <Route path="workouts" element={<MemberWorkouts />} />
            <Route path="diet" element={<MemberDiet />} />
            <Route path="goals" element={<MemberGoals />} />
            <Route path="progress" element={<MemberProgress />} />
            <Route path="membership" element={<MemberMembership />} />
            <Route path="payments" element={<MemberPayments />} />
            <Route path="profile" element={<MemberProfile />} />
            <Route path="notifications" element={<MemberNotifications />} />
            <Route path="announcements" element={<MemberAnnouncements />} />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
