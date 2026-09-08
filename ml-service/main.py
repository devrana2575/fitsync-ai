import os
import sys
from datetime import datetime, timedelta

import joblib
import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List

from pymongo import MongoClient

app = FastAPI(title="FitSync AI ML Service", version="1.0.0")

CORS_ORIGINS = [o.strip() for o in os.getenv("ML_CORS_ORIGINS", "http://localhost:5173,http://localhost:5000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/fitsync-ai")
ML_API_TOKEN = os.getenv("ML_API_TOKEN", "")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)

client = None
db = None


def get_db():
    global client, db
    if client is None:
        client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=3000)
        db = client.get_database()
    return db


def require_token(
    x_api_key: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
):
    """Optional shared-secret guard for the ML endpoints.

    Enabled only when ML_API_TOKEN is set (recommended for production).
    When unset, requests are accepted so the local dev stack keeps working.
    """
    if not ML_API_TOKEN:
        return
    provided = x_api_key or ""
    if authorization and authorization.lower().startswith("bearer "):
        provided = authorization[7:]
    if provided != ML_API_TOKEN:
        raise HTTPException(status_code=401, detail="Invalid or missing API token")


_model_cache = {}


def load_model(name):
    """Load a joblib artifact once and reuse it for subsequent requests."""
    if name in _model_cache:
        return _model_cache[name]
    model_path = os.path.join(MODELS_DIR, f"{name}.joblib")
    if not os.path.exists(model_path):
        raise FileNotFoundError(name)
    _model_cache[name] = joblib.load(model_path)
    return _model_cache[name]


def clear_models():
    _model_cache.clear()


class SegmentRequest(BaseModel):
    memberId: Optional[str] = None


class EngagementRiskRequest(BaseModel):
    memberId: Optional[str] = None


class ProgressAnomalyRequest(BaseModel):
    memberId: Optional[str] = None


class AttendanceRequest(BaseModel):
    days: int = 30


@app.post("/reload-models", dependencies=[Depends(require_token)])
def reload_models():
    clear_models()
    return {"status": "ok", "message": "Model cache cleared"}


@app.get("/health")
def health_check():
    try:
        get_db().command("ping")
        return {"status": "healthy", "mongodb": "connected", "timestamp": datetime.now().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=503, detail={
            "status": "unhealthy",
            "mongodb": "disconnected",
            "error": str(e),
        })


SEGMENT_FEATURES = ["attendance_30d", "attendance_pct", "days_since_visit", "workout_30d",
                    "workout_completion", "membership_days_left", "payments_completed",
                    "payments_pending", "membership_duration", "weight_change"]

ENGAGEMENT_FEATURES = ["attendance_30d", "attendance_pct", "days_since_visit", "workout_30d",
                       "workout_completion", "membership_days_left", "payments_pending",
                       "membership_duration"]


def fetch_member_features():
    """Build the member-feature dataframe.

    Equivalent to the previous per-member query loop but batched with MongoDB
    aggregations so feature extracton scales with the member count. Field
    names, formulas and defaults are unchanged so training and inference keep
    using identical feature definitions.
    """
    db = get_db()

    users = list(db.users.find({"role": "member", "isActive": True}))
    if not users:
        return pd.DataFrame()

    member_ids = [u["_id"] for u in users]
    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)

    att_by_user = {}
    for row in db.attendances.aggregate([
        {"$match": {"user": {"$in": member_ids}}},
        {"$group": {
            "_id": "$user",
            "total": {"$sum": 1},
            "recent": {"$sum": {"$cond": [{"$gte": ["$date", thirty_days_ago]}, 1, 0]}},
            "lastDate": {"$max": "$date"},
        }},
    ]):
        att_by_user[row["_id"]] = row

    wk_by_user = {}
    for row in db.workoutlogs.aggregate([
        {"$match": {"user": {"$in": member_ids}}},
        {"$group": {
            "_id": "$user",
            "total": {"$sum": 1},
            "recent": {"$sum": {"$cond": [{"$gte": ["$date", thirty_days_ago]}, 1, 0]}},
            "recentCompleted": {"$sum": {"$cond": [
                {"$and": [{"$gte": ["$date", thirty_days_ago]}, {"$eq": ["$isCompleted", True]}]},
                1, 0,
            ]}},
        }},
    ]):
        wk_by_user[row["_id"]] = row

    active_memberships = list(db.memberships.find(
        {"user": {"$in": member_ids}, "status": "ACTIVE"},
        {"user": 1, "endDate": 1},
    ))
    mem_by_user = {m["user"]: m for m in active_memberships}

    pay_by_user = {}
    for row in db.payments.aggregate([
        {"$match": {"user": {"$in": member_ids}, "status": {"$in": ["COMPLETED", "PENDING"]}}},
        {"$group": {"_id": {"user": "$user", "status": "$status"}, "count": {"$sum": 1}}},
    ]):
        key = row["_id"]["user"]
        entry = pay_by_user.setdefault(key, {"COMPLETED": 0, "PENDING": 0})
        entry[row["_id"]["status"]] = row["count"]

    meas_by_user = {}
    for row in db.bodymeasurements.aggregate([
        {"$match": {"user": {"$in": member_ids}}},
        {"$sort": {"date": -1}},
        {"$group": {"_id": "$user", "weights": {"$push": {"weight": "$weight"}}}},
    ]):
        meas_by_user[row["_id"]] = row["weights"]

    records = []
    for user in users:
        uid = user["_id"]

        att = att_by_user.get(uid)
        attendance_total = att["total"] if att else 0
        attendance_30d = att["recent"] if att else 0
        last_att = att["lastDate"] if att else None
        days_since_visit = (now - last_att).days if last_att else 999

        wk = wk_by_user.get(uid)
        workout_total = wk["total"] if wk else 0
        workout_30d = wk["recent"] if wk else 0
        completed_30d = wk["recentCompleted"] if wk else 0

        membership = mem_by_user.get(uid)
        membership_active = 1 if membership else 0
        membership_days_left = 0
        if membership and "endDate" in membership:
            membership_days_left = max(0, (membership["endDate"] - now).days)

        pay = pay_by_user.get(uid, {"COMPLETED": 0, "PENDING": 0})
        payments_completed = pay["COMPLETED"]
        payments_pending = pay["PENDING"]

        weights = [w.get("weight", 0) for w in meas_by_user.get(uid, [])][:5]
        weight_change = 0
        if len(weights) >= 2:
            weight_change = weights[0] - weights[-1]

        join_date = user.get("createdAt", now)
        membership_duration = (now - join_date).days

        attendance_pct = (attendance_30d / 30.0 * 100) if attendance_30d > 0 else 0
        workout_completion = (completed_30d / workout_30d * 100) if workout_30d > 0 else 0

        records.append({
            "memberId": str(uid),
            "name": user.get("name", ""),
            "attendance_total": attendance_total,
            "attendance_30d": attendance_30d,
            "attendance_pct": attendance_pct,
            "days_since_visit": days_since_visit,
            "workout_total": workout_total,
            "workout_30d": workout_30d,
            "workout_completion": workout_completion,
            "membership_active": membership_active,
            "membership_days_left": membership_days_left,
            "payments_completed": payments_completed,
            "payments_pending": payments_pending,
            "membership_duration": membership_duration,
            "weight_change": weight_change,
        })

    return pd.DataFrame(records)


def _segment(df, req_member_id):
    member_row = df[df["memberId"] == req_member_id]
    if member_row.empty:
        raise HTTPException(status_code=404, detail="Member not found in data")

    try:
        model = load_model("segmentation_model")
        scaler = load_model("segmentation_scaler")
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Segmentation model not trained yet. Run training first.")

    X = member_row[SEGMENT_FEATURES].values
    X_scaled = scaler.transform(X)
    cluster = model.predict(X_scaled)[0]

    segment_map = {0: "Regular", 1: "Highly Active", 2: "At Risk", 3: "Inactive"}
    segment = segment_map.get(cluster, f"Cluster {cluster}")

    membership_duration = member_row.iloc[0]["membership_duration"]
    attendance_pct = member_row.iloc[0]["attendance_pct"]

    if attendance_pct > 75 and membership_duration > 180:
        segment = "Highly Active"
    elif attendance_pct > 40:
        segment = "Regular"
    elif attendance_pct > 15:
        segment = "At Risk"
    else:
        segment = "Inactive"

    return {
        "memberId": req_member_id,
        "name": member_row.iloc[0]["name"],
        "segment": segment,
        "confidence": round(float(1.0 / (1.0 + min(model.transform(X_scaled)[0]))), 4),
        "features": {col: float(member_row.iloc[0][col]) for col in SEGMENT_FEATURES}
    }


def _segment_all(df):
    try:
        model = load_model("segmentation_model")
        scaler = load_model("segmentation_scaler")
    except FileNotFoundError:
        return {"predictions": [], "message": "Model not trained"}

    X = df[SEGMENT_FEATURES].values
    X_scaled = scaler.transform(X)
    clusters = model.predict(X_scaled)
    transformed = model.transform(X_scaled)

    predictions = []
    for i, (_, row) in enumerate(df.iterrows()):
        attendance_pct = row["attendance_pct"]
        membership_duration = row["membership_duration"]

        if attendance_pct > 75 and membership_duration > 180:
            segment = "Highly Active"
        elif attendance_pct > 40:
            segment = "Regular"
        elif attendance_pct > 15:
            segment = "At Risk"
        else:
            segment = "Inactive"

        predictions.append({
            "memberId": row["memberId"],
            "name": row["name"],
            "segment": segment,
            "confidence": round(float(1.0 / (1.0 + min(transformed[i]))), 4),
            "features": {col: float(row[col]) for col in SEGMENT_FEATURES}
        })

    return {"predictions": predictions, "total": len(predictions)}


def _engagement_risk(df, req_member_id):
    member_row = df[df["memberId"] == req_member_id]
    if member_row.empty:
        raise HTTPException(status_code=404, detail="Member not found")

    try:
        model = load_model("engagement_model")
        scaler = load_model("engagement_scaler")
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail="Engagement model not trained yet.")

    X = member_row[ENGAGEMENT_FEATURES].values
    X_scaled = scaler.transform(X)

    risk_proba = model.predict_proba(X_scaled)[0]
    risk_class = model.predict(X_scaled)[0]

    risk_labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    risk_level = risk_labels.get(int(risk_class), "MEDIUM")
    probability = float(max(risk_proba))

    member = member_row.iloc[0]
    reasons = []
    if member["days_since_visit"] > 14:
        reasons.append(f"Has not visited gym for {int(member['days_since_visit'])} days")
    if member["attendance_pct"] < 30:
        reasons.append(f"Attendance is only {member['attendance_pct']:.0f}% in last 30 days")
    if member["workout_completion"] < 50:
        reasons.append(f"Workout completion rate is {member['workout_completion']:.0f}%")
    if member["payments_pending"] > 0:
        reasons.append(f"Has {int(member['payments_pending'])} pending payment(s)")

    reason = "; ".join(reasons) if reasons else "Overall risk assessment based on behavioral patterns"

    return {
        "memberId": req_member_id,
        "name": member["name"],
        "riskLevel": risk_level,
        "probability": round(probability, 4),
        "reason": reason,
        "features": {col: float(member[col]) for col in ENGAGEMENT_FEATURES}
    }


def _engagement_risk_all(df):
    try:
        model = load_model("engagement_model")
        scaler = load_model("engagement_scaler")
    except FileNotFoundError:
        return {"predictions": [], "message": "Model not trained"}

    X = df[ENGAGEMENT_FEATURES].values
    X_scaled = scaler.transform(X)
    risk_probas = model.predict_proba(X_scaled)
    risk_classes = model.predict(X_scaled)

    risk_labels = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
    predictions = []

    for i, (_, row) in enumerate(df.iterrows()):
        risk_level = risk_labels.get(int(risk_classes[i]), "MEDIUM")
        probability = float(max(risk_probas[i]))

        reasons = []
        if row["days_since_visit"] > 14:
            reasons.append(f"Not visited for {int(row['days_since_visit'])} days")
        if row["attendance_pct"] < 30:
            reasons.append(f"Low attendance ({row['attendance_pct']:.0f}%)")
        if row["workout_completion"] < 50:
            reasons.append(f"Low workout completion ({row['workout_completion']:.0f}%)")

        predictions.append({
            "memberId": row["memberId"],
            "name": row["name"],
            "riskLevel": risk_level,
            "probability": round(probability, 4),
            "reason": "; ".join(reasons) if reasons else "Behavioral pattern assessment",
            "features": {col: float(row[col]) for col in ENGAGEMENT_FEATURES}
        })

    return {"predictions": predictions, "total": len(predictions)}


@app.post("/predict/segment", dependencies=[Depends(require_token)])
def predict_segment(req: SegmentRequest):
    if not req.memberId:
        raise HTTPException(status_code=400, detail="memberId is required")

    df = fetch_member_features()
    if df.empty:
        raise HTTPException(status_code=404, detail="No member data available")

    return _segment(df, req.memberId)


@app.post("/predict/segment-all", dependencies=[Depends(require_token)])
def predict_segment_all():
    df = fetch_member_features()
    if df.empty:
        return {"predictions": [], "message": "No member data available"}

    return _segment_all(df)


@app.post("/predict/engagement-risk", dependencies=[Depends(require_token)])
def predict_engagement_risk(req: EngagementRiskRequest):
    if not req.memberId:
        raise HTTPException(status_code=400, detail="memberId is required")

    df = fetch_member_features()
    if df.empty:
        raise HTTPException(status_code=404, detail="No member data available")

    return _engagement_risk(df, req.memberId)


@app.post("/predict/engagement-risk-all", dependencies=[Depends(require_token)])
def predict_engagement_risk_all():
    df = fetch_member_features()
    if df.empty:
        return {"predictions": [], "message": "No data available"}

    return _engagement_risk_all(df)


@app.post("/predict/progress-anomaly", dependencies=[Depends(require_token)])
def predict_progress_anomaly(req: ProgressAnomalyRequest):
    db = get_db()
    from bson import ObjectId

    member_id = req.memberId
    if not member_id:
        raise HTTPException(status_code=400, detail="memberId is required")

    try:
        uid = ObjectId(member_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid memberId format")

    measurements = list(db.bodymeasurements.find({"user": uid}).sort("date", 1))
    workouts = list(db.workoutlogs.find({"user": uid}).sort("date", 1))

    anomalies = []

    if len(measurements) >= 4:
        weights = [m.get("weight", 0) for m in measurements if m.get("weight")]
        if len(weights) >= 4:
            weights_arr = np.array(weights, dtype=float)
            diffs = np.diff(weights_arr)
            if len(diffs) >= 3:
                rolling_mean = np.convolve(np.abs(diffs), np.ones(3)/3, mode='valid')
                if len(rolling_mean) > 0 and np.std(rolling_mean) < 0.1:
                    anomalies.append({
                        "type": "weight_stagnation",
                        "description": "Weight has remained nearly unchanged for the last few weeks",
                        "severity": "warning",
                        "data": {"weights": [float(w) for w in weights[-6:]]}
                    })

            mean_w = np.mean(weights_arr)
            std_w = np.std(weights_arr)
            if std_w > 0:
                z_scores = np.abs((weights_arr - mean_w) / std_w)
                for j, z in enumerate(z_scores):
                    if z > 2.0:
                        anomalies.append({
                            "type": "weight_outlier",
                            "description": f"Unusual weight reading detected: {weights[j]:.1f} kg",
                            "severity": "warning",
                            "data": {"weight": float(weights[j]), "z_score": float(z)}
                        })

    if len(workouts) >= 8:
        recent = workouts[-8:]
        completion_rate = sum(1 for w in recent if w.get("isCompleted", False)) / len(recent)
        if completion_rate < 0.3:
            anomalies.append({
                "type": "workout_decline",
                "description": f"Workout completion rate dropped to {completion_rate*100:.0f}%",
                "severity": "critical",
                "data": {"completion_rate": completion_rate}
            })

        weights_lifted = [w.get("weight", 0) for w in recent if w.get("weight", 0) > 0]
        if len(weights_lifted) >= 4:
            first_half = np.mean(weights_lifted[:len(weights_lifted)//2])
            second_half = np.mean(weights_lifted[len(weights_lifted)//2:])
            if abs(second_half - first_half) < 0.5 * first_half:
                anomalies.append({
                    "type": "performance_stagnation",
                    "description": "Workout performance has remained nearly unchanged recently",
                    "severity": "info",
                    "data": {"recent_avg_weight": float(second_half)}
                })

    if not anomalies:
        anomalies.append({
            "type": "normal",
            "description": "No significant anomalies detected in progress",
            "severity": "info",
            "data": {}
        })

    return {
        "memberId": member_id,
        "anomalies": anomalies,
        "measurementCount": len(measurements),
        "workoutCount": len(workouts)
    }


@app.post("/predict/attendance", dependencies=[Depends(require_token)])
def predict_attendance(req: AttendanceRequest):
    db = get_db()

    days = req.days
    now = datetime.now()

    daily_counts = []
    for d in range(days, 0, -1):
        day = now - timedelta(days=d)
        day_start = day.replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = db.attendances.count_documents({"date": {"$gte": day_start, "$lt": day_end}})
        daily_counts.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    counts = [d["count"] for d in daily_counts]
    if len(counts) < 7:
        return {"forecast": [], "peakHours": [], "message": "Insufficient data for forecasting"}

    counts_arr = np.array(counts, dtype=float)
    window = 7
    moving_avg = np.convolve(counts_arr, np.ones(window)/window, mode='valid')

    if len(moving_avg) > 0:
        trend = np.polyfit(range(len(moving_avg)), moving_avg, 1)
        forecast_values = []
        for i in range(1, 8):
            future_val = trend[0] * (len(moving_avg) + i) + trend[1]
            future_val = max(0, future_val)
            forecast_date = now + timedelta(days=i)
            forecast_values.append({
                "date": forecast_date.strftime("%Y-%m-%d"),
                "predicted": round(float(future_val), 1),
                "isWeekend": forecast_date.weekday() >= 5
            })
    else:
        forecast_values = []

    hourly = db.attendances.aggregate([
        {"$match": {"date": {"$gte": now - timedelta(days=30)}}},
        {"$group": {"_id": {"$hour": "$checkInTime"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}}
    ])
    peak_hours = [{"hour": h["_id"], "count": h["count"]} for h in hourly]

    weekly_pattern = db.attendances.aggregate([
        {"$match": {"date": {"$gte": now - timedelta(days=30)}}},
        {"$group": {"_id": {"$dayOfWeek": "$date"}, "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}}
    ])
    day_names = {0: "", 1: "Sunday", 2: "Monday", 3: "Tuesday", 4: "Wednesday", 5: "Thursday", 6: "Friday", 7: "Saturday"}
    weekly = [{"day": day_names.get(w["_id"], str(w["_id"])), "count": w["count"]} for w in weekly_pattern]

    avg_daily = float(np.mean(counts_arr)) if len(counts_arr) > 0 else 0
    trend_direction = "stable"
    if len(moving_avg) > 1:
        if trend[0] > 0.5:
            trend_direction = "increasing"
        elif trend[0] < -0.5:
            trend_direction = "decreasing"

    return {
        "historical": daily_counts[-30:],
        "forecast": forecast_values,
        "peakHours": peak_hours,
        "weeklyPattern": weekly,
        "averageDaily": round(avg_daily, 1),
        "trend": trend_direction
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)