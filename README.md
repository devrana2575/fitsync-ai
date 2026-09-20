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
- **Equipment Management** - Track equipment condition and maintenance schedules
- **Notifications** - In-app notifications for membership, attendance, risk alerts
- **Announcements** - Poster board with priority levels, pinning and expiry
- **Online Payments** - Stripe checkout with demo-mode fallback for membership purchase
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

### 4. ML Service Setup

```bash
cd ml-service
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate
pip install -r requirements.txt
```

### 5. Seed Database

```bash
cd server
npm run seed
```

### 6. Train ML Models

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
ML_SERVICE_URL=http://localhost:8001
CORS_ORIGIN=http://localhost:5173
```

## Running the Application

### Start All Services

```bash
# Terminal 1 - Backend
cd server
npm run dev

# Terminal 2 - Frontend
cd client
npm run dev

# Terminal 3 - ML Service
cd ml-service
venv\Scripts\python main.py    # Windows
venv/bin/python main.py         # Linux/Mac
```

### Access

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **ML API**: http://localhost:8001/docs (Swagger UI)

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

### ML Predictions
- `POST /api/ml/predict/segment-all` - Run segmentation on all members
- `POST /api/ml/predict/engagement-risk-all` - Run engagement risk on all
- `POST /api/ml/predict/progress-anomaly` - Detect progress anomalies
- `POST /api/ml/predict/attendance` - Attendance forecasting
- `GET /api/ml/predictions` - Get stored predictions
- `GET /api/ml/insights` - Get AI insights

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
6. **Payment Gateway**: Stripe integrated but demo-mode is the default fallback
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
