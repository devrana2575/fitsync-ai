# FitSync AI - AI-Powered Gym Management & Fitness Intelligence System

A comprehensive full-stack gym management system with integrated machine learning capabilities, built as an MCA Semester 3 project (200 credits).

## Features

### Core Management
- **Member Management** - Add, edit, search, filter, paginate members
- **Trainer Management** - Add trainers, assign specializations, track workload
- **Membership Plans** - Create/manage plans with pricing and duration
- **Membership Tracking** - Active, expired, pending, cancelled memberships with renewal
- **Payment Management** - Record payments, track status, revenue analytics
- **Attendance** - Manual check-in, QR check-in, daily/monthly tracking
- **Workout Plans** - Trainers create plans, assign exercises with sets/reps/weight
- **Exercise Library** - 20+ pre-built exercises across categories
- **Workout Templates** - Pre-built templates with one-click member assignment
- **Diet Checklist** - Daily check-off of completed diet types (keto, vegan, etc.)
- **Fitness Goals** - Weight loss, muscle gain, strength, endurance goals
- **Body Measurements** - Weight, BMI, body fat, circumferences tracking
- **Member & Trainer Profiles** - Self-serve "Complete Your Profile": profile photo, personal/contact/body/fitness details for members and personal/professional/availability details for trainers, with a deterministic per-role completion score shown on the dashboard and profile pages
- **Equipment Management** - Track equipment condition and maintenance schedules
- **Notifications** - In-app notifications for membership, attendance, risk alerts
- **Announcements** - Poster board with priority levels, pinning and expiry
- **Online Payments** - Razorpay checkout with server-side verification and webhook reconciliation, plus Stripe and UPI scan-to-pay options
- **Email/SMS Alerts** - Optional dispatch for membership expiry, risk and announcements
- **Reports** - Revenue, membership, attendance, ML risk reports

### Dashboards
- **Admin Dashboard** - KPIs, revenue trend, attendance trend, membership distribution, peak hours
- **Trainer Dashboard** - Assigned members, attendance, workout completion
- **Member Dashboard** - Membership info, attendance %, progress charts, AI insights

### Machine Learning
- **Member Segmentation** - K-Means clustering into Highly Active, Regular, At Risk, Inactive
- **Engagement Risk Prediction** - Random Forest classifier predicting LOW/MEDIUM/HIGH risk
- **Progress Anomaly Detection** - Isolation Forest detecting weight stagnation, workout decline
- **Attendance Forecasting** - Moving average forecasting with peak hour identification

### AI Insights
- Automated insight generation from analytics and ML results
- Human-readable explanations for attendance patterns, risk levels, and progress anomalies

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js, Vite, Tailwind CSS, Recharts, React Router, Axios |
| Backend | Node.js, Express.js, MongoDB, Mongoose, JWT, bcrypt |
| ML Service | Python, FastAPI, scikit-learn, Pandas, NumPy, joblib |
| Database | MongoDB 8.x |

## Architecture

```
React Frontend (port 5173)
       |
       | REST API
       v
Node.js + Express (port 5000)
       |
       | HTTP requests
       v
FastAPI ML Service (port 8001)
       |
       v
MongoDB (port 27017)
```

## Project Structure

```
fitsync-ai/
├── client/                    # React frontend
│   └── src/
│       ├── components/common/ # Reusable UI components
│       ├── pages/admin/       # Admin dashboard pages
│       ├── pages/trainer/     # Trainer dashboard pages
│       ├── pages/member/      # Member dashboard pages
│       ├── pages/auth/        # Login/Register pages
│       ├── layouts/           # Dashboard layout
│       ├── services/          # API service (Axios)
│       ├── context/           # Auth context
│       └── utils/             # Utility functions
├── server/                    # Node.js backend
│   ├── models/                # 21 Mongoose schemas
│   ├── routes/                # 24 route files
│   ├── middleware/             # Auth & role middleware
│   ├── config/                # Database config
│   └── utils/                 # Helpers, seed, cron
├── ml-service/                # Python ML service
│   ├── main.py                # FastAPI endpoints
│   ├── training/              # Model training scripts
│   ├── models/                # Saved ML models (.joblib)
│   └── data/                  # Feature data CSV
└── docs/
```

## Database Schema

| Collection | Description |
|-----------|-------------|
| users | User accounts with roles (admin/trainer/member) |
| memberprofiles | Member details, emergency contact, assigned trainer |
| trainerprofiles | Trainer specializations, certifications, experience |
| membershipplans | Plan name, price, duration, features |
| memberships | User-plan association, status, dates |
| payments | Payment records with amount, method, status |
| attendances | Check-in/out times, duration, method |
| workoutplans | Trainer-created plans with exercise assignments |
| workouttemplates | Pre-built workout templates reusable across members |
| exercises | Exercise library with categories and muscle groups |
| workoutlogs | Member workout completion records |
| dietlogs | Member daily diet completion checklists |
| fitnessgoals | Member fitness goals with progress tracking |
| bodymeasurements | Weight, height, BMI, body circumferences |
| equipment | Gym equipment with condition and maintenance |
| announcements | Gym poster board with priority and expiry |
| progressphotos | Member progress photo history |
| notifications | In-app notifications |
| gymsettings | Gym name and settings |

## Installation

### Prerequisites
- Node.js v18+
- Python 3.10+
- MongoDB (running locally or Atlas URI)

### 1. Clone and Setup

```bash
cd fitsync-ai
```

### 2. Backend Setup

```bash
cd server
cp ../.env.example .env    # Edit .env with your settings
npm install
```

### 3. Frontend Setup

```bash
cd client
npm install
```

### 4. ML Service Setup (optional)

> The Express backend does **not** expose `/api/ml/*` routes and does not call
> this service. `ml-service/` is a standalone experiments service on port 8001.
> Nothing in the app depends on it; the fitness recommendation endpoint is a
> local rule-based implementation in `server/routes/recommendations.js`.

```bash
cd ml-service
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Seed Database (development demo data only)

```bash
cd server
npm run seed
```

> The seed injects demo admin/trainer/member accounts and demo plans. It is for
> local development **only** - production must not rely on it. On a fresh,
> empty database the server instead bootstraps a single admin automatically from
> `ADMIN_EMAIL` / `ADMIN_PASSWORD` (startup fails clearly if they are missing or
> too weak).

### 6. Train ML Models (optional - see ML service note above)

```bash
cd ml-service
python training/train_models.py
```

## Environment Variables

Create `.env` in the `server/` directory:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fitsync-ai
JWT_SECRET=your_secret_key_here
JWT_EXPIRE=7d
CORS_ORIGIN=http://localhost:5173
CLIENT_URL=http://localhost:5173

# Fresh-install admin (empty DB only)
ADMIN_EMAIL=
ADMIN_PASSWORD=

# Payment gateway (production REQUIRES one of these, else startup fails)
# 1. Razorpay (recommended) - used whenever configured:
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=
# 2. Stripe (cards)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
# 3. UPI scan-to-pay (gym counter / manual verification)
UPI_ID=
UPI_NAME=FitSync AI Gym
```

`ML_SERVICE_URL` is present for compatibility but is **not consumed** by the API.

### Razorpay setup (recommended gateway)

1. Create an account at https://dashboard.razorpay.com and grab your **Key ID** and **Key Secret**
   (Dashboard → Settings → API keys). For development use test keys (`rzp_test_...`); go live with
   keys that start with `rzp_live_`.
2. Set `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` in `server/.env` (and optionally
   `RAZORPAY_WEBHOOK_SECRET`).
3. Register the webhook on the Razorpay dashboard (Settings → Webhooks):
   `https://<your-host>/api/payments/razorpay/webhook` with the events
   `payment.captured`, `payment.failed`, `payment.refunded`, using the same
   `RAZORPAY_WEBHOOK_SECRET`. The webhook makes activation automatic even if the member
   closes the checkout popup before the verification call returns.
4. In `NODE_ENV=production` the server refuses to start with missing or test Razorpay keys —
   a real checkout gateway is mandatory.

### Payment lifecycle

- Members pay through the **Razorpay Checkout** popup. The server creates the order from the
  **database price** (never the client), then re-verifies the payment signature, the order
  and the real gateway **capture** state before the payment may complete.
- A payment only becomes `COMPLETED` after this server-side verification or via the webhook.
  The member's frontend alone can never complete a payment.
- UPI stays available as a self-serve scan-to-pay option (member claims the payment and the
  gym verifies it) and as an admin counter option. When Razorpay is configured, the member's
  "Buy" button opens the Razorpay checkout.
- Gateway refunds (`payments` collection → a Razorpay payment) first issue the refund through
  Razorpay and mark the payment `REFUNDED` only after the gateway confirms it; the linked
  membership is cancelled.

### Profile completion

- Members and trainers can complete their own profile from the **Profile** page (photo,
  personal details, fitness/business info) and the dashboard shows a completion card until
  the required fields are filled.
- Completion is computed **deterministically on the server** from the actual profile fields
  (`GET /api/auth/me` → `completion`): `percent`, `allRequiredComplete`, the list of
  `missing` fields, and the per-section `requiredSections` breakdown.
- Required (needed for 100%): **member** - full name, date of birth, phone, height, weight;
  **trainer** - full name, phone, specializations, years of experience, working days and
  working hours. Everything else (goals, emergency contact, medical info, certifications,
  bio, physical stats, etc.) is optional and never blocks 100%.
- Profile photo upload (`POST /api/auth/me/avatar`) and removal (`DELETE /api/auth/me/avatar`)
  store files under `server/uploads/avatars` (JPEG/PNG/WebP/GIF, max 2 MB). Members can only
  ever change their **own** profile; role/status fields are never accepted through the
  self-update endpoint.

### Database relationships

The system uses **User as the single identity/authentication entity**. All role data,
business records and audit trails reference `user → User` (ObjectId). There is no separate
Member/Trainer auth record, only role-specific profiles:

```
User  ──1:1── MemberProfile   (user → User, unique)   email/password live only on User
User  ──1:1── TrainerProfile  (user → User, unique)   email/password live only on User

User (member)  1→N  Membership   (user → User, plan → MembershipPlan)
User (member)  1→N  Payment      (user → User, membership → Membership, confirmedBy → User)
User (member)  1→N  Attendance   (user → User — same collection used for trainer check-ins)
User (member)  1→N  BodyMeasurement (user → User)
User (member)  1→N  FitnessGoal  (user → User)
User (member)  1→N  WorkoutLog   (user → User, workoutPlan → WorkoutPlan, exercise → Exercise)
User (member)  1→N  DietLog      (user → User)
User (member)  1→N  Notification (user → User — recipient, never a name/email field)
User (member)  1→N  ProgressPhoto(user → User)
User (member)  1→1  Medical & emergency info (embedded in MemberProfile)

Membership ──N:1── MembershipPlan  (plan → MembershipPlan)
Payment    ──N:1── Membership      (membership → Membership; plan is resolved via the membership)

WorkoutPlan ── trainer → User, member → User (both required; no name fields)
WorkoutPlan exercises ── embedded list ref'ing Exercise by id (intentionally embedded architecture)

Trainer assignment: MemberProfile.assignedTrainer → User (the trainer), with status + assignedAt.
  Set through the allocation service or the admin assign-trainer route; never client-supplied.

Announcement ── createdBy → User   WorkoutTemplate ── createdBy → User   Equipment ── reportedBy → User
```

Integrity rules enforced by the routes (never trusted from the frontend): refs are set from the
authenticated session or re-validated server-side; a member's `trade`-gated records (plans,
attendance, payments, measurements, goals) are scoped to the owner; trainer allocation verifies
the member, the trainer's active/eligibility and capacity; deleting a user is a **soft deactivate**
(`DELETE /api/users/:id`) that preserves all history; the AllData debug page refuses to hard-delete
any record that is still referenced (users, profiles, plans with memberships, memberships with
payments) and instead tells the admin to deactivate; a recorded measurement keeps the member
profile's current weight/height in sync with the measurement history (single source of truth).

## Running the Application

### Start All Services

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev

# Terminal 3 (optional) - standalone ML experiments service
cd ml-service
venv\Scripts\python main.py    # Windows
venv/bin/python main.py         # Linux/Mac
```

### Access

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **ML API**: http://localhost:8001/docs (Swagger UI)

## Production Deployment

FitSync AI deploys directly on Node.js + MongoDB (no container tooling).

```bash
# 1. Install dependencies (backend + frontend)
cd server && npm install
cd ../client && npm install

# 2. Configure the environment
cp .env.example server/.env   # then edit server/.env (see "Environment Variables")
#    Required: JWT_SECRET, MONGODB_URI, and at least one payment gateway
#    (RAZORPAY_KEY_ID/SECRET or STRIPE_SECRET_KEY or UPI_ID). In
#    NODE_ENV=production the server refuses to start without them.

# 3. Start MongoDB (local service, or point MONGODB_URI at a hosted Atlas URI)

# 4. Build the frontend - the backend then serves client/dist automatically
cd client && npm run build

# 5. Start the backend (serves the API on PORT and the built frontend)
cd server && npm start        # or: npm run dev
```

- The API is served on `PORT` (default 5000) and, when `client/dist` exists,
  the same Express process serves the built React app with SPA fallback
  (`GET /` and client-side routes resolve to `index.html`).
- Health monitoring: `GET /api/health` returns
  `{ status: 'ok', timestamp, service: 'fitsync-ai-api' }`.
- The server shuts down cleanly on `SIGINT`/`SIGTERM` (stops cron jobs,
  closes the HTTP server, disconnects Mongo and exits).
- Uploaded profile/progress images are stored under `server/uploads/`
  (avatars, photos). Back this folder up; it is not versioned.

For local development, run the two services separately instead: Terminal 1
`cd server && npm run dev`, Terminal 2 `cd client && npm run dev`.

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@fitsync.ai | Admin@123 |
| Trainer | trainer@fitsync.ai | Trainer@123 |
| Member | member@fitsync.ai | Member@123 |

Additional demo accounts (trainers, members) are seeded automatically. See `.env.example` for the full list.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/me` - Update profile

### Members
- `GET /api/members` - List members (admin/trainer)
- `GET /api/members/:id` - Get member details
- `POST /api/members` - Create member (admin)
- `PUT /api/members/:id` - Update member (admin)

### Attendance
- `POST /api/attendance/checkin` - Check in member
- `POST /api/attendance/qr-checkin` - QR check-in
- `GET /api/attendance/today` - Today's attendance
- `GET /api/attendance/stats` - Attendance statistics

### Payments (Razorpay)
- `POST /api/checkout/create` - Start checkout (returns the active gateway mode)
- `POST /api/checkout/razorpay/order` - Create/refresh a Razorpay order (DB-priced, deduped)
- `POST /api/checkout/razorpay/verify` - Verify signature + gateway capture, complete payment
- `POST /api/payments/razorpay/webhook` - Razorpay webhook (captured/failed/refunded)
- `POST /api/checkout/upi/confirm/:paymentId` - Member "I have paid" claim (stays PENDING for admin verification)

### ML Predictions

⚠️ **Not wired.** The Express API exposes **no** `/api/ml/*` endpoints and does
not integrate the ML service. The recommendation feature is served locally by
`GET /api/recommendations`. See `ml-service/` for the standalone experiments
pipeline.

### Diet
- `GET /api/diet/types` - List available diet types
- `GET /api/diet/log?date=YYYY-MM-DD` - Get a member's diet checklist log for a day
- `PUT /api/diet/log` - Toggle completion of a diet type for a day
- `GET /api/diet/stats` - Weekly diet completion stats and streak

### Analytics
- `GET /api/analytics/admin/dashboard` - Admin dashboard stats
- `GET /api/analytics/admin/revenue-trend` - Revenue trend
- `GET /api/analytics/admin/attendance-trend` - Attendance trend
- `GET /api/analytics/member/dashboard` - Member dashboard
- `GET /api/analytics/trainer/dashboard` - Trainer dashboard

## ML Methodology

### Member Segmentation (K-Means)
- **Features**: Attendance frequency, workout frequency, completion rate, membership duration, payment behavior
- **Clusters**: 4 segments mapped to Highly Active, Regular, At Risk, Inactive
- **Approach**: StandardScaler + K-Means with cluster analysis

### Engagement Risk (Random Forest)
- **Features**: Recent attendance, days since last visit, workout frequency, membership status
- **Output**: Risk level (LOW/MEDIUM/HIGH) with probability
- **Evaluation**: Classification report with accuracy, precision, recall, F1

### Progress Anomaly Detection
- **Technique**: Statistical analysis (rolling averages, z-scores, threshold detection)
- **Detects**: Weight stagnation, workout performance plateau, attendance decline

### Attendance Forecasting
- **Technique**: Moving average trend extrapolation
- **Output**: 7-day forecast, peak hours, weekly pattern, trend direction

## Dataset

The ML models are trained on **synthetic data** generated to simulate realistic gym usage patterns:
- 20 members with varied attendance behaviors (high performers, declining, inactive)
- 90 days of attendance records
- 2000+ workout logs with exercise types and completion status
- 240 body measurements over 12 months
- Realistic patterns: weekend dips, declining attendance leading to higher risk

## Limitations

1. **Synthetic Data**: ML training data is generated, not real gym data
2. **Small Dataset**: 20 members may not represent real-world gym population
3. **Forecasting**: Simple moving average, not ARIMA or Prophet
4. **Anomaly Detection**: Statistical thresholds, not deep learning
5. **No Real-time**: WebSocket implemented for notifications only, not live dashboards
6. **Payment Gateway**: Razorpay/Stripe/UPI integrated; demo-mode completion exists only as a development fallback and is always disabled in production
7. **QR Check-in**: Basic implementation, not camera-based scanner
8. **Diet Tracking**: Fixed list of diet types (keto, vegan, etc.) as a daily completion checklist

## Future Scope

- WebSocket real-time dashboards
- Integration with wearable devices
- Advanced time-series forecasting (Prophet, LSTM)
- Mobile app (React Native)
- Body composition analysis with camera
- Class scheduling

## Project Report

This project demonstrates:
1. Full-stack web development (React + Node.js + MongoDB)
2. Database design with 16 collections and proper relationships
3. JWT authentication with role-based access control
4. RESTful API design with validation
5. Data visualization with interactive charts
6. Machine learning pipeline (data collection to prediction)
7. ML model training and evaluation
8. API integration between Node.js and FastAPI
9. Automated insight generation
10. Software engineering best practices
