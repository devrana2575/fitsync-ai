const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const TrainingJob = require('../models/TrainingJob');
const Notification = require('../models/Notification');
const User = require('../models/User');

const ML_URL = process.env.ML_SERVICE_URL || 'http://localhost:8001';
const ML_TOKEN = process.env.ML_API_TOKEN || '';
const TRAIN_SCRIPT = path.join(__dirname, '..', '..', 'ml-service', 'training', 'train_models.py');
const PYTHON_CMD = process.env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3');

function mlHeaders() {
  return ML_TOKEN ? { 'X-Api-Key': ML_TOKEN } : {};
}

async function reloadModels() {
  try {
    await axios.post(`${ML_URL}/reload-models`, {}, { timeout: 15000, headers: mlHeaders() });
    return true;
  } catch (error) {
    console.warn('[ML Retrain] reload-models call failed (service may be offline):', error.message);
    return false;
  }
}

async function notifyAdmins(title, message, models) {
  try {
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        title,
        message,
        type: 'system',
        data: { models }
      });
    }
  } catch (error) {
    console.warn('[ML Retrain] admin notification failed:', error.message);
  }
}

const retrainModels = async (jobType = 'scheduled') => {
  const job = await TrainingJob.create({ jobType, status: 'running' });
  console.log(`[ML Retrain] ${jobType} retraining started (job ${job._id})`);

  if (!fs.existsSync(TRAIN_SCRIPT)) {
    job.status = 'failed';
    job.finishedAt = new Date();
    job.memberCount = 0;
    job.details = `Training script not found at ${TRAIN_SCRIPT}`;
    await job.save();
    await notifyAdmins('ML Retraining Failed', job.details, []);
    console.error(`[ML Retrain] FAILED: ${job.details}`);
    return job;
  }

  return new Promise((resolve) => {
    const child = spawn(PYTHON_CMD, [TRAIN_SCRIPT], {
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      windowsHide: true
    });

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    child.on('error', async (err) => {
      job.status = 'failed';
      job.finishedAt = new Date();
      job.details = `Failed to launch Python: ${err.message}`;
      await job.save();
      await notifyAdmins('ML Retraining Failed', job.details, []);
      console.error('[ML Retrain] FAILED:', err.message);
      resolve(job);
    });

    child.on('close', async (code) => {
      const models = ['segmentation_model', 'segmentation_scaler', 'engagement_model', 'engagement_scaler'];
      const memberMatch = output.match(/Found (\d+) members/);
      job.memberCount = memberMatch ? Number(memberMatch[1]) : 0;

      if (code === 0) {
        await reloadModels();
        job.status = 'completed';
        job.details = output.trim().slice(0, 1500);
        await job.save();
        console.log(`[ML Retrain] completed: ${job.memberCount} members involved`);
        await notifyAdmins('ML Models Retrained', `Automatic model retraining finished. ${job.memberCount} members were used for training.`, models);
      } else {
        job.status = 'failed';
        job.details = (output.trim() || `Training exited with code ${code}`).slice(0, 1500);
        await job.save();
        console.error(`[ML Retrain] FAILED with code ${code}`);
        await notifyAdmins('ML Retraining Failed', `Automatic model retraining exited with code ${code}.`, models);
      }
      job.models = models;
      await job.save();
      resolve(job);
    });
  });
};

const startMlRetrainCron = (cron) => {
  cron.schedule(process.env.ML_RETRAIN_CRON || '30 3 * * *', () => retrainModels('scheduled'));
  console.log('[ML Retrain] Scheduled automated model retraining (03:30 daily)');
};

const getTrainingJobs = async (limit = 20) => {
  return TrainingJob.find().sort({ startedAt: -1 }).limit(limit);
};

module.exports = { retrainModels, startMlRetrainCron, getTrainingJobs, reloadModels };