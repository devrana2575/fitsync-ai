import os
import sys
import warnings

import joblib
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from pymongo import MongoClient
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score

warnings.filterwarnings('ignore')

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/fitsync-ai")
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
os.makedirs(MODELS_DIR, exist_ok=True)


def get_db():
    client = MongoClient(MONGODB_URI)
    return client.get_database()


def extract_features():
    db = get_db()
    now = datetime.now()
    thirty_days_ago = now - timedelta(days=30)

    users = list(db.users.find({"role": "member"}))
    if not users:
        print("No members found. Run seed script first.")
        return None

    print(f"Found {len(users)} members. Extracting features...")

    records = []
    for user in users:
        uid = user["_id"]

        att_total = db.attendances.count_documents({"user": uid})
        att_30d = db.attendances.count_documents({"user": uid, "date": {"$gte": thirty_days_ago}})

        last_att = db.attendances.find_one({"user": uid}, sort=[("date", -1)])
        days_since = (now - last_att["date"]).days if last_att else 999

        workout_total = db.workoutlogs.count_documents({"user": uid})
        workout_30d = db.workoutlogs.count_documents({"user": uid, "date": {"$gte": thirty_days_ago}})
        completed_30d = db.workoutlogs.count_documents({"user": uid, "date": {"$gte": thirty_days_ago}, "isCompleted": True})

        membership = db.memberships.find_one({"user": uid, "status": "ACTIVE"})
        mem_active = 1 if membership else 0
        mem_days_left = 0
        if membership and "endDate" in membership:
            mem_days_left = max(0, (membership["endDate"] - now).days)

        pay_completed = db.payments.count_documents({"user": uid, "status": "COMPLETED"})
        pay_pending = db.payments.count_documents({"user": uid, "status": "PENDING"})

        measurements = list(db.bodymeasurements.find({"user": uid}).sort("date", -1).limit(5))
        weight_change = 0
        if len(measurements) >= 2:
            w1 = measurements[0].get("weight", 0) or 0
            w2 = measurements[-1].get("weight", 0) or 0
            weight_change = w1 - w2

        join_date = user.get("createdAt", now)
        mem_duration = (now - join_date).days

        att_pct = (att_30d / 30.0 * 100) if att_30d > 0 else 0
        workout_comp = (completed_30d / workout_30d * 100) if workout_30d > 0 else 0

        is_active = user.get("isActive", True)

        risk_label = 0
        if att_pct < 15 and days_since > 21:
            risk_label = 2
        elif att_pct < 30 and days_since > 10:
            risk_label = 1
        elif att_pct < 50:
            risk_label = 1

        records.append({
            "memberId": str(uid),
            "name": user.get("name", ""),
            "attendance_total": att_total,
            "attendance_30d": att_30d,
            "attendance_pct": att_pct,
            "days_since_visit": days_since,
            "workout_total": workout_total,
            "workout_30d": workout_30d,
            "workout_completion": workout_comp,
            "membership_active": mem_active,
            "membership_days_left": mem_days_left,
            "payments_completed": pay_completed,
            "payments_pending": pay_pending,
            "membership_duration": mem_duration,
            "weight_change": weight_change,
            "isActive": is_active,
            "risk_label": risk_label,
        })

    return pd.DataFrame(records)


def train_segmentation(df):
    print("\n=== Training Member Segmentation Model (K-Means) ===")

    feature_cols = ["attendance_30d", "attendance_pct", "days_since_visit", "workout_30d",
                    "workout_completion", "membership_days_left", "payments_completed",
                    "payments_pending", "membership_duration", "weight_change"]

    X = df[feature_cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    inertias = []
    K_range = range(2, min(8, len(df)))
    for k in K_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        km.fit(X_scaled)
        inertias.append(km.inertia_)

    optimal_k = 4
    if len(df) < 4:
        optimal_k = 2

    model = KMeans(n_clusters=optimal_k, random_state=42, n_init=10)
    model.fit(X_scaled)

    labels = model.predict(X_scaled)
    df["cluster"] = labels

    print(f"Optimal clusters: {optimal_k}")
    print(f"Cluster sizes: {dict(zip(*np.unique(labels, return_counts=True)))}")

    for c in range(optimal_k):
        cluster_data = df[df["cluster"] == c]
        print(f"\nCluster {c} ({len(cluster_data)} members):")
        print(f"  Avg attendance %: {cluster_data['attendance_pct'].mean():.1f}%")
        print(f"  Avg days since visit: {cluster_data['days_since_visit'].mean():.1f}")
        print(f"  Avg workout completion: {cluster_data['workout_completion'].mean():.1f}%")

    model_path = os.path.join(MODELS_DIR, "segmentation_model.joblib")
    scaler_path = os.path.join(MODELS_DIR, "segmentation_scaler.joblib")
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    print(f"\nSegmentation model saved to {model_path}")
    return model, scaler


def train_engagement_risk(df):
    print("\n=== Training Engagement Risk Prediction Model (Random Forest) ===")

    feature_cols = ["attendance_30d", "attendance_pct", "days_since_visit", "workout_30d",
                    "workout_completion", "membership_days_left", "payments_pending",
                    "membership_duration"]

    X = df[feature_cols].values
    y = df["risk_label"].values

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    if len(df) < 10:
        print("Not enough data for train/test split. Training on full dataset.")
        X_train, X_test, y_train, y_test = X_scaled, X_scaled, y, y
    else:
        X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42, stratify=y)

    model = RandomForestClassifier(
        n_estimators=100,
        max_depth=10,
        min_samples_split=2,
        random_state=42,
        class_weight='balanced'
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)

    print(f"\nModel Accuracy: {accuracy:.2%}")
    print("\nClassification Report:")
    target_names = ["LOW", "MEDIUM", "HIGH"]
    present_labels = sorted(set(y_test) | set(y_pred))
    present_names = [target_names[i] for i in present_labels if i < len(target_names)]
    present_y_test = [y_test[j] for j in range(len(y_test)) if y_test[j] in present_labels]
    present_y_pred = [y_pred[j] for j in range(len(y_pred)) if y_test[j] in present_labels]
    if present_y_test:
        print(classification_report(present_y_test, present_y_pred, target_names=present_names[:len(set(present_y_test))]))

    importances = model.feature_importances_
    print("\nFeature Importances:")
    for col, imp in sorted(zip(feature_cols, importances), key=lambda x: -x[1]):
        print(f"  {col}: {imp:.4f}")

    model_path = os.path.join(MODELS_DIR, "engagement_model.joblib")
    scaler_path = os.path.join(MODELS_DIR, "engagement_scaler.joblib")
    joblib.dump(model, model_path)
    joblib.dump(scaler, scaler_path)

    print(f"\nEngagement model saved to {model_path}")
    return model, scaler


def main():
    print("=" * 60)
    print("FitSync AI - ML Model Training")
    print("=" * 60)

    df = extract_features()
    if df is None or df.empty:
        print("No data available for training.")
        return

    print(f"\nTotal records: {len(df)}")

    csv_path = os.path.join(os.path.dirname(__file__), "..", "data", "member_features.csv")
    df.to_csv(csv_path, index=False)
    print(f"Features saved to {csv_path}")

    train_segmentation(df)
    train_engagement_risk(df)

    print("\n" + "=" * 60)
    print("Training complete! Models saved.")
    print("=" * 60)


if __name__ == "__main__":
    main()
