const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { jobs } = require('./state');
const { runExtraction, runProcessing } = require('./worker');

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve output files for downloading
app.use('/api/download', express.static(path.join(__dirname, 'output')));

// Set up file upload with Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const jobId = req.body.jobId || uuidv4();
    req.body.jobId = jobId; 
    cb(null, `${jobId}_${file.originalname}`);
  }
});
const upload = multer({ storage });

// 1. Upload API
app.post('/api/upload', upload.single('memo'), (req, res) => {
  try {
    const jobId = req.body.jobId;
    
    // Start background extraction
    setTimeout(() => {
        runExtraction(jobId, req.file ? req.file.filename : null);
    }, 0);

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
app.post('/api/process', upload.any(), (req, res) => {
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

    const jobData = {
      vet_name: vetName,
      va_file_number: vaFileNumber,
      conditions: parsedConditions,
      manualFiles,
      manualLinks: parsedLinks,
      esfFilename
    };

    // Start background processing
    setTimeout(() => {
        runProcessing(jobId, jobData);
    }, 0);
    
    res.json({ success: true, message: 'Job started in background' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Status API
app.get('/api/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const type = req.query.type || 'process-pdf';
    
    const job = jobs[jobId];
    
    if (!job || job.type !== type) {
      return res.json({ status: 'not_found' });
    }

    res.json({
      jobId,
      status: job.status,
      stage: job.stage || 'queued',
      current_condition: job.current_condition || '',
      message: job.message || '',
      condition_packets: job.condition_packets || {}
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. Cancel API
app.post('/api/cancel/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (jobs[jobId]) {
        jobs[jobId].isCancelled = true;
    }

    res.json({ success: true, message: 'Job marked for cancellation' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 5. Continue API
app.post('/api/continue/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    
    if (jobs[jobId]) {
        jobs[jobId].captchaSolved = true;
    }

    res.json({ success: true, message: 'Job marked to continue' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Serve React Frontend Statically
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(port, () => {
  console.log(`🚀 VA Evidence Monolith running on port ${port}`);
  console.log(`👉 Open http://localhost:${port} in your browser`);
});
