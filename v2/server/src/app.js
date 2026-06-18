const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { Queue, QueueEvents } = require('bullmq');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const path = require('path');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve output files for downloading
app.use('/api/download', express.static(path.join(__dirname, '../output')));

// Set up file upload with Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads')); // Save directly to /usr/src/app/uploads which is shared
  },
  filename: (req, file, cb) => {
    const jobId = req.body.jobId || uuidv4();
    req.body.jobId = jobId; 
    cb(null, `${jobId}_${file.originalname}`);
  }
});
const upload = multer({ storage });

// Setup Redis/BullMQ connection
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
};

const processQueue = new Queue('process-queue', { connection });
const processQueueEvents = new QueueEvents('process-queue', { connection });

// 1. Upload API
app.post('/api/upload', upload.single('memo'), async (req, res) => {
  try {
    const jobId = req.body.jobId;
    
    // Add extraction job to queue
    const job = await processQueue.add('extract', {
      memoPath: req.file ? req.file.filename : null,
      jobId
    });

    res.json({
      success: true,
      jobId,
      message: 'File uploaded and extraction started'
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Process API (Accepts manual PDF uploads)
app.post('/api/process', upload.any(), async (req, res) => {
  try {
    const { jobId, vetName, vaFileNumber, conditions, manualLinks } = req.body;
    
    // Parse the conditions array from JSON
    const parsedConditions = JSON.parse(conditions || '[]');
    const parsedLinks = JSON.parse(manualLinks || '{}');

    // Map manual uploaded files to their conditions
    const manualFiles = {};
    let esfFilename = null;
    if (req.files) {
      req.files.forEach(file => {
        if (file.fieldname === 'esf') {
          esfFilename = file.filename;
        } else if (file.fieldname.startsWith('manual_')) {
          const condName = file.fieldname.replace('manual_', '');
          if (!manualFiles[condName]) manualFiles[condName] = [];
          manualFiles[condName].push(file.filename);
        }
      });
    }

    await processQueue.add('process-pdf', {
      jobId,
      vet_name: vetName,
      va_file_number: vaFileNumber,
      conditions: parsedConditions,
      manualFiles,
      manualLinks: parsedLinks,
      esfFilename
    });
    
    res.json({ success: true, message: 'Job enqueued for background processing' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Status API
app.get('/api/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const type = req.query.type || 'process-pdf';
    
    // Find the latest job for this jobId
    const jobs = await processQueue.getJobs(['active', 'waiting', 'completed', 'failed']);
    const job = jobs.find(j => j.data && j.data.jobId === jobId && j.name === type);
    
    if (!job) {
      return res.json({ status: 'not_found' });
    }

    const state = await job.getState();
    const progress = job.progress || {};
    let status = state === 'completed' ? 'done' : 'processing';
    if (state === 'failed') status = 'error';

    res.json({
      jobId,
      status,
      stage: progress.stage || 'queued',
      current_condition: progress.condition || '',
      message: progress.message || '',
      condition_packets: state === 'completed' && job.returnvalue ? job.returnvalue : {}
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. Cancel API
app.post('/api/cancel/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // Set a flag in Redis so the worker knows to abort the job
    const Redis = require('ioredis');
    const redisClient = new Redis(connection.port, connection.host);
    
    // Set a short expiration so it cleans itself up (e.g., 5 minutes)
    await redisClient.set(`cancel_job_${jobId}`, 'true', 'EX', 300);
    await redisClient.quit();

    res.json({ success: true, message: 'Job marked for cancellation' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 5. Continue API
app.post('/api/continue/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const Redis = require('ioredis');
    const redisClient = new Redis(connection.port, connection.host);
    
    // Set a flag in Redis so the worker knows the user solved the CAPTCHA
    await redisClient.set(`captcha_solved_${jobId}`, 'true', 'EX', 300);
    await redisClient.quit();

    res.json({ success: true, message: 'Job marked to continue' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Node.js API running on port ${port}`);
});
