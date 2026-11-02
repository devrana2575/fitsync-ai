import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowPathIcon,
  ChartBarIcon,
  BanknotesIcon,
  UsersIcon,
  CheckCircleIcon,
  CreditCardIcon,
  ClockIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import api from '../../services/api';
import ErrorState from '../../components/common/ErrorState';
import EmptyState from '../../components/common/EmptyState';
import PageHeader from '../../components/common/PageHeader';
import StatCard from '../../components/common/StatCard';
import { Skeleton, SkeletonCard } from '../../components/common/Skeleton';
import { toINR } from '../../utils/format';
import {
  AXIS,
  CHART_COLORS,
  LEGEND_STYLE,
  SERIES_COLORS,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
} from '../../utils/chartTheme';

const RANGES = [
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
  { days: 180, label: '180D' },
  { days: 365, label: '1Y' },
];

const STATUS_LABELS = {
  ACTIVE: 'Active',
  PENDING: 'Pending',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
  SUSPENDED: 'Suspended',
};

const STATUS_ORDER = ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED', 'SUSPENDED'];

const METHOD_LABELS = {
  cash: 'Cash',
  card: 'Card',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  online: 'Online',
};

const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_LABELS = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

const fmt = (value) => Number(value || 0).toLocaleString('en-IN');
const titleize = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const parseDay = (key) => {
  const parts = String(key || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const pad2 = (value) => String(value).padStart(2, '0');

const fillDays = (points) => {
  if (points.length < 2) return points;
  const sorted = [...points].sort((a, b) => a.day.localeCompare(b.day));
  const start = parseDay(sorted[0].day);
  const end = parseDay(sorted[sorted.length - 1].day);
  if (!start || !end) return sorted;
  const counts = new Map(sorted.map((point) => [point.day, point]));
  const filled = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`;
    filled.push(counts.get(key) || { day: key, count: 0 });
  }
  return filled;
};

const fillMonths = (points) => {
  if (points.length < 2) return points;
  const sorted = [...points].sort((a, b) => a.month.localeCompare(b.month));
  const counts = new Map(sorted.map((point) => [point.month, point]));
  const [startYear, startMonth] = sorted[0].month.split('-').map(Number);
  const [endYear, endMonth] = sorted[sorted.length - 1].month.split('-').map(Number);
  if (!startYear || !startMonth || !endYear || !endMonth) return sorted;
  const filled = [];
  let year = startYear;
  let month = startMonth;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    const key = `${year}-${pad2(month)}`;
    filled.push(counts.get(key) || { month: key, revenue: 0, count: 0 });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return filled;
};

const dateLabel = (key, long = false) => {
  const date = parseDay(key);
  if (!date) return key || '';
  return date.toLocaleDateString('en-IN', long
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short' });
};

const monthLabel = (key) => {
  const [year, month] = String(key || '').split('-').map(Number);
  if (!year || !month) return key || '';
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

const hourRange = (hour) => {
  const value = Number.parseInt(String(hour || '').slice(0, 2), 10);
  if (!Number.isFinite(value)) return hour;
  const next = String((value + 1) % 24).padStart(2, '0');
  return `${String(value).padStart(2, '0')}:00 - ${next}:00`;
};

export default function Analytics() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [weekday, setWeekday] = useState([]);
  const [membershipDist, setMembershipDist] = useState([]);
  const [planPopularity, setPlanPopularity] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [days, setDays] = useState(90);
  const [showAverage, setShowAverage] = useState(true);
  const [businessHours, setBusinessHours] = useState(false);
  const [selectedHour, setSelectedHour] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState({});

  const fetchAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const params = { days };
    const results = await Promise.allSettled([
      api.get('/analytics/admin/dashboard'),
      api.get('/analytics/admin/revenue-trend'),
      api.get('/analytics/admin/attendance-trend', { params }),
      api.get('/analytics/admin/peak-hours', { params }),
      api.get('/analytics/admin/attendance-weekday', { params }),
      api.get('/analytics/admin/membership-distribution'),
      api.get('/analytics/admin/plan-popularity'),
      api.get('/analytics/admin/payment-methods'),
    ]);

    const [dashResult, revResult, attResult, peakResult, weekResult, memResult, planResult, payResult] = results;
    const newErrors = {};
    const valueOf = (result) => result.status === 'fulfilled' ? (result.value.data || {}) : {};

    const dash = valueOf(dashResult);
    if (dashResult.status === 'fulfilled') setStats(dash);
    else newErrors.stats = dashResult.reason?.message;

    const rev = valueOf(revResult);
    if (revResult.status === 'fulfilled') {
      const raw = rev.trend || rev.data || [];
      const points = raw
        .filter((row) => row._id?.year && row._id?.month)
        .map((row) => ({
          month: `${row._id.year}-${pad2(row._id.month)}`,
          revenue: row.total || 0,
          count: row.count || 0,
        }));
      setRevenue(fillMonths(points));
    } else {
      newErrors.revenue = revResult.reason?.message;
    }

    const att = valueOf(attResult);
    if (attResult.status === 'fulfilled') {
      const raw = att.trend || att.data || [];
      setAttendance(fillDays(raw.filter((row) => row._id).map((row) => ({ day: row._id, count: row.count || 0 }))));
    } else {
      newErrors.attendance = attResult.reason?.message;
    }

    const peak = valueOf(peakResult);
    if (peakResult.status === 'fulfilled') {
      const raw = peak.peakHours || peak.data || [];
      setPeakHours(raw
        .filter((row) => row && row._id !== null && row._id !== undefined)
        .map((row) => ({
          hour: `${String(row._id).padStart(2, '0')}:00`,
          hourNumber: Number(row._id),
          count: row.count || 0,
        }))
        .sort((a, b) => a.hourNumber - b.hourNumber));
    } else {
      newErrors.peakHours = peakResult.reason?.message;
    }

    const week = valueOf(weekResult);
    if (weekResult.status === 'fulfilled') {
      setWeekday(week.weekday || []);
    } else {
      newErrors.weekday = weekResult.reason?.message;
    }

    const mem = valueOf(memResult);
    if (memResult.status === 'fulfilled') {
      const raw = mem.distribution || mem.data || [];
      const statusRank = (status) => {
        const index = STATUS_ORDER.indexOf(status);
        return index === -1 ? STATUS_ORDER.length : index;
      };
      setMembershipDist(raw
        .filter((row) => row && row._id)
        .map((row) => ({ status: String(row._id).toUpperCase(), count: row.count || 0 }))
        .sort((a, b) => statusRank(a.status) - statusRank(b.status)));
    } else {
      newErrors.membershipDist = memResult.reason?.message;
    }

    const plan = valueOf(planResult);
    if (planResult.status === 'fulfilled') {
      setPlanPopularity((plan.plans || []).map((row) => ({
        plan: row.plan || 'Unassigned',
        count: row.count || 0,
      })));
    } else {
      newErrors.planPopularity = planResult.reason?.message;
    }

    const pay = valueOf(payResult);
    if (payResult.status === 'fulfilled') {
      setPaymentMethods((pay.methods || []).map((row) => ({
        method: METHOD_LABELS[row._id] || titleize(row._id),
        amount: row.total || 0,
        count: row.count || 0,
      })));
    } else {
      newErrors.paymentMethods = payResult.reason?.message;
    }

    setErrors(newErrors);
    setLoading(false);
    setRefreshing(false);
  }, [days]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchAll(true);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchAll]);

  const attendanceWithAverage = useMemo(() => attendance.map((point, index) => {
    const window = attendance.slice(Math.max(0, index - 6), index + 1);
    const average = window.reduce((sum, item) => sum + Number(item.count || 0), 0) / window.length;
    return { ...point, average: Number(average.toFixed(1)) };
  }), [attendance]);

  const weekdayData = useMemo(() => {
    const counts = new Map(weekday.map((row) => [row.day, row.count || 0]));
    return WEEKDAY_ORDER.map((day) => ({ day, count: counts.get(day) || 0 }));
  }, [weekday]);

  const peakHour = useMemo(
    () => peakHours.reduce((best, row) => (row.count > (best?.count || 0) ? row : best), null),
    [peakHours]
  );

  const busiestWeekday = useMemo(
    () => weekdayData.reduce((best, row) => (row.count > (best?.count || 0) ? row : best), null),
    [weekdayData]
  );

  const revenueTotal = useMemo(() => revenue.reduce((sum, row) => sum + Number(row.revenue || 0), 0), [revenue]);
  const paymentTotal = useMemo(() => revenue.reduce((sum, row) => sum + Number(row.count || 0), 0), [revenue]);
  const attendanceTotal = useMemo(() => attendance.reduce((sum, row) => sum + Number(row.count || 0), 0), [attendance]);
  const attendanceAverage = attendance.length ? (attendanceTotal / attendance.length).toFixed(1) : '0.0';
  const membershipTotal = useMemo(() => membershipDist.reduce((sum, row) => sum + Number(row.count || 0), 0), [membershipDist]);
  const paymentCollected = useMemo(() => paymentMethods.reduce((sum, row) => sum + Number(row.amount || 0), 0), [paymentMethods]);
  const topPlan = planPopularity[0];
  const visiblePeakHours = businessHours
    ? peakHours.filter((row) => row.hourNumber >= 5 && row.hourNumber < 23)
    : peakHours;
  const selectedHourRow = selectedHour ? peakHours.find((row) => row.hour === selectedHour) : null;

  const handleRefresh = () => fetchAll(true);

  return (
    <div className="page-wrap space-y-6">
      <PageHeader
        title="Reports & Charts"
        subtitle="Understand revenue, attendance, membership and payment activity at a glance"
        icon={ChartBarIcon}
        actions={
          <>
            <div className="flex rounded-lg border border-border bg-surface p-0.5" role="group" aria-label="Select reporting window">
              {RANGES.map((range) => (
                <button
                  key={range.days}
                  type="button"
                  onClick={() => setDays(range.days)}
                  aria-pressed={days === range.days}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    days === range.days
                      ? 'bg-white text-brand-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <button onClick={handleRefresh} disabled={refreshing} className="btn btn-outline btn-md">
              <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </>
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={BanknotesIcon}
            label="Total Revenue"
            value={toINR(stats?.totalRevenue)}
            color="ink"
            onClick={() => navigate('/admin/payments')}
            ariaLabel="View payments and revenue"
          />
          <StatCard
            icon={ExclamationTriangleIcon}
            label="Pending Payments"
            value={toINR(stats?.pendingPayments)}
            color="yellow"
            onClick={() => navigate('/admin/payments')}
            ariaLabel="View pending payments"
          />
          <StatCard
            icon={UsersIcon}
            label="Active Members"
            value={fmt(stats?.activeMembers)}
            color="green"
            onClick={() => navigate('/admin/members?status=active')}
            ariaLabel="View active members"
          />
          <StatCard
            icon={CreditCardIcon}
            label="Active Memberships"
            value={fmt(stats?.activeMemberships)}
            color="brand"
            onClick={() => navigate('/admin/memberships?status=ACTIVE')}
            ariaLabel="View active memberships"
          />
          <StatCard
            icon={ClockIcon}
            label="Expiring Soon"
            value={fmt(stats?.expiringSoon)}
            color="orange"
            onClick={() => navigate('/admin/memberships?status=EXPIRING_SOON')}
            ariaLabel="View memberships expiring soon"
          />
          <StatCard
            icon={CalendarDaysIcon}
            label="Monthly Attendance"
            value={fmt(stats?.monthlyAttendance)}
            color="blue"
            onClick={() => navigate('/admin/attendance')}
            ariaLabel="View attendance records"
          />
          <StatCard
            icon={CheckCircleIcon}
            label="Today's Attendance"
            value={fmt(stats?.todayAttendance)}
            color="green"
            onClick={() => navigate('/admin/attendance')}
            ariaLabel="View today's attendance"
          />
          <StatCard
            icon={UserPlusIcon}
            label="New Members (30d)"
            value={fmt(stats?.newMembers)}
            color="purple"
            onClick={() => navigate('/admin/members')}
            ariaLabel="View members"
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <ChartCard
          className="xl:col-span-2"
          title="Revenue Trend"
          subtitle="Completed payments by month"
          loading={loading}
          error={errors.revenue && "We couldn't load the revenue trend."}
          onRetry={handleRefresh}
          hasData={revenue.length > 0}
        >
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={revenue} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.brand} stopOpacity={0.24} />
                  <stop offset="95%" stopColor={CHART_COLORS.brand} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} />
              <XAxis dataKey="month" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} tickFormatter={monthLabel} />
              <YAxis tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} tickFormatter={(value) => `₹${(Number(value || 0) / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value, _name, item) => [toINR(value), `${item?.payload?.count || 0} payments`]}
                labelFormatter={monthLabel}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={CHART_COLORS.brand} strokeWidth={2.5} fill="url(#revenueFill)" activeDot={{ r: 5 }} />
            </AreaChart>
          </ResponsiveContainer>
          <ChartSummary>
            <span>12-month total <strong className="text-slate-900">{toINR(revenueTotal)}</strong></span>
            <span>Payments <strong className="text-slate-900">{fmt(paymentTotal)}</strong></span>
            <span>Average payment <strong className="text-slate-900">{toINR(paymentTotal ? revenueTotal / paymentTotal : 0)}</strong></span>
          </ChartSummary>
        </ChartCard>

        <ChartCard
          title="Membership Status"
          subtitle="Distribution of every membership record"
          loading={loading}
          error={errors.membershipDist && "We couldn't load the membership breakdown."}
          onRetry={handleRefresh}
          hasData={membershipDist.length > 0}
        >
          <div className="relative">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={membershipDist}
                  cx="50%"
                  cy="50%"
                  outerRadius={102}
                  innerRadius={66}
                  dataKey="count"
                  nameKey="status"
                  paddingAngle={2}
                  cursor="pointer"
                  onClick={(entry) => {
                    const status = entry?.status || entry?.payload?.status;
                    if (status) navigate(`/admin/memberships?status=${status}`);
                  }}
                  isAnimationActive={false}
                >
                  {membershipDist.map((entry, index) => (
                    <Cell key={entry.status} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [`${fmt(value)} memberships`, 'Count']}
                  labelFormatter={(label) => STATUS_LABELS[label] || titleize(label)}
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={TOOLTIP_LABEL_STYLE}
                  itemStyle={TOOLTIP_ITEM_STYLE}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-semibold tabular-nums text-slate-900">{fmt(membershipTotal)}</span>
              <span className="text-xs text-slate-500">memberships</span>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {membershipDist.map((entry, index) => (
              <button
                key={entry.status}
                type="button"
                onClick={() => navigate(`/admin/memberships?status=${entry.status}`)}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-brand-300 hover:text-brand-700"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                {STATUS_LABELS[entry.status] || titleize(entry.status)}
                <span className="tabular-nums text-slate-900">{fmt(entry.count)}</span>
              </button>
            ))}
          </div>
        </ChartCard>

        <ChartCard
          className="xl:col-span-2"
          title="Attendance Trend"
          subtitle={`Daily check-ins and 7-day average over the last ${days} days`}
          loading={loading}
          error={errors.attendance && "We couldn't load the attendance trend."}
          onRetry={handleRefresh}
          hasData={attendance.length > 0}
          controls={
            <button
              type="button"
              onClick={() => setShowAverage((value) => !value)}
              aria-pressed={showAverage}
              className="btn btn-outline btn-sm"
            >
              {showAverage ? 'Hide' : 'Show'} 7-day average
            </button>
          }
        >
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={attendanceWithAverage} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={{ stroke: AXIS.axis }}
                tick={{ fontSize: 12, fill: AXIS.tick }}
                tickFormatter={dateLabel}
                minTickGap={22}
                interval="preserveStartEnd"
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip
                formatter={(value, name) => [fmt(value), name]}
                labelFormatter={(label) => dateLabel(label, true)}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="count" name="Daily check-ins" fill={CHART_COLORS.brand} radius={[4, 4, 0, 0]} maxBarSize={18} />
              {showAverage && <Line type="monotone" dataKey="average" name="7-day average" stroke={CHART_COLORS.warning} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />}
            </ComposedChart>
          </ResponsiveContainer>
          <ChartSummary>
            <span>Check-ins <strong className="text-slate-900">{fmt(attendanceTotal)}</strong></span>
            <span>Daily average <strong className="text-slate-900">{attendanceAverage}</strong></span>
            <span>Busiest day <strong className="text-slate-900">{busiestWeekday?.day ? `${WEEKDAY_LABELS[busiestWeekday.day] || busiestWeekday.day} · ${fmt(busiestWeekday.count)}` : 'No activity'}</strong></span>
          </ChartSummary>
        </ChartCard>

        <ChartCard
          title="Peak Hours"
          subtitle={`Check-ins by hour over the last ${days} days`}
          loading={loading}
          error={errors.peakHours && "We couldn't load the peak hours data."}
          onRetry={handleRefresh}
          hasData={peakHours.length > 0}
          controls={
            <button
              type="button"
              onClick={() => setBusinessHours((value) => !value)}
              aria-pressed={businessHours}
              className="btn btn-outline btn-sm"
            >
              {businessHours ? 'Show 24 hours' : 'Business hours'}
            </button>
          }
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={visiblePeakHours} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} />
              <XAxis dataKey="hour" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 11, fill: AXIS.tick }} interval={businessHours ? 2 : 3} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip
                formatter={(value) => [`${fmt(value)} check-ins`, 'Check-ins']}
                labelFormatter={hourRange}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Bar
                dataKey="count"
                name="Check-ins"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
                onClick={(entry) => {
                  const hour = entry?.hour || entry?.payload?.hour;
                  if (hour) setSelectedHour(hour);
                }}
                cursor="pointer"
              >
                {visiblePeakHours.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={entry.hour === selectedHour ? CHART_COLORS.warning : entry.hour === peakHour?.hour ? CHART_COLORS.brand : CHART_COLORS.brandSoft}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ChartSummary>
            <span>Peak hour <strong className="text-slate-900">{peakHour ? `${hourRange(peakHour.hour)} · ${fmt(peakHour.count)}` : 'No activity'}</strong></span>
            {selectedHourRow ? (
              <span>
                Selected <strong className="text-slate-900">{hourRange(selectedHourRow.hour)} · {fmt(selectedHourRow.count)} check-ins</strong>
                <button type="button" onClick={() => setSelectedHour(null)} className="ml-2 font-medium text-brand-600 hover:underline">Clear</button>
              </span>
            ) : (
              <span className="text-slate-500">Click a bar to inspect an hour</span>
            )}
          </ChartSummary>
        </ChartCard>

        <ChartCard
          title="Weekly Rhythm"
          subtitle={`Check-ins by weekday over the last ${days} days`}
          loading={loading}
          error={errors.weekday && "We couldn't load the weekday breakdown."}
          onRetry={handleRefresh}
          hasData={weekdayData.some((row) => row.count > 0)}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekdayData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} />
              <XAxis dataKey="day" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip
                formatter={(value) => [`${fmt(value)} check-ins`, 'Check-ins']}
                labelFormatter={(label) => WEEKDAY_LABELS[label] || label}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Bar dataKey="count" name="Check-ins" radius={[4, 4, 0, 0]} maxBarSize={34}>
                {weekdayData.map((entry) => (
                  <Cell key={entry.day} fill={entry.day === busiestWeekday?.day ? CHART_COLORS.success : CHART_COLORS.brandSoft} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ChartSummary>
            <span>Busiest day <strong className="text-slate-900">{busiestWeekday?.count ? `${WEEKDAY_LABELS[busiestWeekday.day] || busiestWeekday.day} · ${fmt(busiestWeekday.count)}` : 'No activity'}</strong></span>
            <span>Quietest weekday <strong className="text-slate-900">{weekdayData.every((row) => row.count === 0) ? 'No activity' : WEEKDAY_LABELS[weekdayData.reduce((best, row) => (row.count < best.count ? row : best), weekdayData[0]).day]}</strong></span>
          </ChartSummary>
        </ChartCard>

        <ChartCard
          title="Active Plan Popularity"
          subtitle="Current active memberships by plan"
          loading={loading}
          error={errors.planPopularity && "We couldn't load the plan breakdown."}
          onRetry={handleRefresh}
          hasData={planPopularity.length > 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={planPopularity} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} horizontal={false} />
              <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <YAxis type="category" dataKey="plan" width={104} tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <Tooltip
                formatter={(value) => [`${fmt(value)} active membership${Number(value) === 1 ? '' : 's'}`, 'Members']}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Bar dataKey="count" name="Active memberships" radius={[0, 5, 5, 0]} maxBarSize={24}>
                {planPopularity.map((entry, index) => (
                  <Cell key={entry.plan} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ChartSummary>
            <span>Top plan <strong className="text-slate-900">{topPlan ? `${topPlan.plan} · ${fmt(topPlan.count)}` : 'No active plans'}</strong></span>
            <span>Plans in use <strong className="text-slate-900">{planPopularity.length}</strong></span>
          </ChartSummary>
        </ChartCard>

        <ChartCard
          title="Payment Methods"
          subtitle="Completed payment value by collection method"
          loading={loading}
          error={errors.paymentMethods && "We couldn't load the payment breakdown."}
          onRetry={handleRefresh}
          hasData={paymentMethods.length > 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={paymentMethods} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={AXIS.grid} />
              <XAxis dataKey="method" tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} />
              <YAxis tickLine={false} axisLine={{ stroke: AXIS.axis }} tick={{ fontSize: 12, fill: AXIS.tick }} tickFormatter={(value) => `₹${(Number(value || 0) / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value, _name, item) => [toINR(value), `${fmt(item?.payload?.count || 0)} payments`]}
                contentStyle={TOOLTIP_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Bar dataKey="amount" name="Collected" radius={[4, 4, 0, 0]} maxBarSize={42}>
                {paymentMethods.map((entry, index) => (
                  <Cell key={entry.method} fill={SERIES_COLORS[index % SERIES_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ChartSummary>
            <span>Total collected <strong className="text-slate-900">{toINR(paymentCollected)}</strong></span>
            <span>Methods <strong className="text-slate-900">{paymentMethods.length}</strong></span>
          </ChartSummary>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartSummary({ children }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
      {children}
    </div>
  );
}

function ChartCard({ title, subtitle, loading, error, onRetry, hasData, controls, className = '', children }) {
  return (
    <div className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
        {controls}
      </div>
      {loading ? (
        <div className="space-y-3">
          <Skeleton width="w-2/3" height="h-3" />
          <Skeleton height="h-[260px]" />
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !hasData ? (
        <div className="flex h-[260px] items-center justify-center">
          <EmptyState icon={ChartBarIcon} message="No data available" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}
