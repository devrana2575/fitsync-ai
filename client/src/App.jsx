import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import PrivateRoute from './components/common/PrivateRoute';
import DashboardLayout from './layouts/DashboardLayout';
import LoadingSpinner from './components/common/LoadingSpinner';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import AdminDashboard from './pages/admin/Dashboard';
import AdminMembers from './pages/admin/Members';
import AdminTrainers from './pages/admin/Trainers';
import AdminMemberships from './pages/admin/Memberships';
import AdminPayments from './pages/admin/Payments';
import AdminAttendance from './pages/admin/Attendance';
import AdminEquipment from './pages/admin/Equipment';
import AdminClasses from './pages/admin/Classes';
import AdminAnalytics from './pages/admin/Analytics';
import AdminMLInsights from './pages/admin/MLInsights';
import TrainerDashboard from './pages/trainer/Dashboard';
import TrainerMembers from './pages/trainer/Members';
import TrainerWorkouts from './pages/trainer/Workouts';
import TrainerAttendance from './pages/trainer/Attendance';
import TrainerClasses from './pages/trainer/Classes';
import TrainerMealPlans from './pages/trainer/MealPlans';
import MemberDashboard from './pages/member/Dashboard';
import MemberAttendance from './pages/member/Attendance';
import MemberWorkouts from './pages/member/Workouts';
import MemberClasses from './pages/member/Classes';
import MemberNutrition from './pages/member/Nutrition';
import MemberGoals from './pages/member/Goals';
import MemberProgress from './pages/member/Progress';
import MemberMembership from './pages/member/Membership';
import MemberPayments from './pages/member/Payments';
import MemberProfile from './pages/member/Profile';
import MemberNotifications from './pages/member/Notifications';
import MemberDetail from './pages/common/MemberDetail';

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
            <Route path="classes" element={<AdminClasses />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="ml-insights" element={<AdminMLInsights />} />
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
            <Route path="classes" element={<TrainerClasses />} />
            <Route path="meal-plans" element={<TrainerMealPlans />} />
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
            <Route path="classes" element={<MemberClasses />} />
            <Route path="nutrition" element={<MemberNutrition />} />
            <Route path="goals" element={<MemberGoals />} />
            <Route path="progress" element={<MemberProgress />} />
            <Route path="membership" element={<MemberMembership />} />
            <Route path="payments" element={<MemberPayments />} />
            <Route path="profile" element={<MemberProfile />} />
            <Route path="notifications" element={<MemberNotifications />} />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      </SocketProvider>
    </AuthProvider>
  );
}
