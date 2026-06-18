const { Worker } = require('bullmq');
const { downloadResearch } = require('./downloader');
const { buildConditionPacket } = require('./pdfBuilder');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');

// Polyfill DOMMatrix for pdf-parse in Node.js
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}
const pdfParse = require('pdf-parse');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
};

const OUTPUT_DIR = path.join(__dirname, 'output');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

async function extractText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  } else if (ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }
  return '';
}

const worker = new Worker('process-queue', async job => {
  if (job.name === 'extract') {
    const memoPath = job.data.memoPath ? path.join(UPLOADS_DIR, job.data.memoPath) : null;
    
    // Extract real text from document
    const text = await extractText(memoPath);
    
    // Fallback if extraction fails
    if (!text) {
      return {
        vet_name: "Unknown Veteran",
        va_file_number: "",
        illnesses_clean: ["Unknown Condition"],
        urls: []
      };
    }

    // Basic regex extraction ported from python
    const nameMatch = text.match(/Veteran\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'\-]+)/);
    const vet_name = nameMatch ? nameMatch[1].trim() : "Unknown Veteran";

    const fileNumMatch = text.match(/\b(0\d{8})\b/) || text.match(/\b(\d{3})[\s\-](\d{3})[\s\-](\d{3})\b/);
    const va_file_number = fileNumMatch ? fileNumMatch[0].replace(/[^\d]/g, '') : "000000000";

    const CONDITIONS = [
      { rx: /obstructive sleep apnea|sleep apnea|OSA\b/i, label: 'Sleep Apnea' },
      { rx: /post.traumatic stress disorder|PTSD\b/i, label: 'PTSD' },
      { rx: /hypertension|high blood pressure/i, label: 'Hypertension' },
      { rx: /diabetes mellitus|diabetes\b/i, label: 'Diabetes Mellitus' },
      { rx: /neuropathy\b/i, label: 'Neuropathy' },
      { rx: /tinnitus/i, label: 'Tinnitus' },
      { rx: /major depressive disorder|depression\b|MDD\b/i, label: 'Depression' },
      { rx: /generalized anxiety disorder|anxiety\b/i, label: 'Anxiety' },
      { rx: /gastroesophageal reflux|GERD\b|acid reflux/i, label: 'GERD' },
      { rx: /migraine headaches|migraines?\b/i, label: 'Migraines' },
      { rx: /traumatic brain injury|TBI\b/i, label: 'TBI' },
      { rx: /lumbar|lumbosacral|low back pain|back pain/i, label: 'Back Pain' },
      { rx: /knee\b/i, label: 'Knee Condition' },
      { rx: /shoulder\b/i, label: 'Shoulder Condition' },
      { rx: /hearing loss|hearing impairment/i, label: 'Hearing Loss' }
    ];

    const illnesses = new Set();
    const urls = {};
    let activeConditions = ["Unknown Condition"];

    const paragraphs = text.split(/\n+/);

    paragraphs.forEach(p => {
      const found = [];
      CONDITIONS.forEach(c => {
        if (c.rx.test(p)) {
          illnesses.add(c.label);
          found.push(c.label);
        }
      });

      if (found.length > 0) {
        activeConditions = found;
      }

      const urlMatch = p.match(/https?:\/\/[^\s\]\)]+/g) || [];
      if (urlMatch.length > 0) {
        activeConditions.forEach(cond => {
          if (!urls[cond]) urls[cond] = [];
          urlMatch.forEach(u => {
            if (!urls[cond].includes(u)) urls[cond].push(u);
          });
        });
      }
    });
    
    return {
      vet_name,
      va_file_number,
      illnesses_clean: Array.from(illnesses).length ? Array.from(illnesses) : ["Unknown Condition"],
      urls
    };
  }

  if (job.name === 'process-pdf') {
    const { jobId, vet_name, va_file_number, conditions, manualFiles, manualLinks, esfFilename } = job.data;
    const condition_packets = {};
    const Redis = require('ioredis');
    const redisClient = new Redis(connection);

    try {
        await job.updateProgress({ stage: 'downloading', message: 'Starting pipeline...' });

        // Iterate through conditions sequentially
        for (const cond of conditions) {
          const isCancelled = await redisClient.get(`cancel_job_${jobId}`);
          if (isCancelled) {
              throw new Error('Job force stopped by user');
          }
          await job.updateProgress({ stage: 'processing', condition: cond, message: `Processing ${cond}` });

          const slug = cond.replace(/\W+/g, '_');
          const finalPdfPath = path.join(OUTPUT_DIR, `${jobId}_Final_${slug}_Packet.pdf`);
          
          const researchPdfs = []; 
          if (manualFiles && manualFiles[cond] && Array.isArray(manualFiles[cond])) {
            for (const file of manualFiles[cond]) {
               researchPdfs.push(path.join(UPLOADS_DIR, file));
            }
          }
          
          if (manualLinks && manualLinks[cond] && Array.isArray(manualLinks[cond])) {
            for (const url of manualLinks[cond]) {
               const isCancelledInner = await redisClient.get(`cancel_job_${jobId}`);
               if (isCancelledInner) throw new Error('Job force stopped by user');
               
               const downloadedPdf = await downloadResearch(url, OUTPUT_DIR, job, redisClient);
               if (downloadedPdf) {
                 researchPdfs.push(downloadedPdf);
               }
            }
          }

          await job.updateProgress({ stage: 'merging', condition: cond, message: `Merging ${cond} packet` });
          
          let esfPath = esfFilename ? path.join(UPLOADS_DIR, esfFilename) : null;
          
          if (!esfPath || !fs.existsSync(esfPath)) {
            esfPath = path.join(UPLOADS_DIR, 'blank_esf.pdf');
            if (!fs.existsSync(esfPath)) {
              const { PDFDocument } = require('pdf-lib');
              const doc = await PDFDocument.create();
              doc.addPage();
              fs.writeFileSync(esfPath, await doc.save());
            }
          }

          await buildConditionPacket(esfPath, researchPdfs, finalPdfPath, vet_name, cond, va_file_number);
          condition_packets[cond] = finalPdfPath;
        }

        await job.updateProgress({ stage: 'done', message: 'All packets generated successfully.' });
        return condition_packets;
    } finally {
        const { cleanupBrowser } = require('./downloader');
        await cleanupBrowser();
        await redisClient.quit();
    }
  }
}, { connection, concurrency: 1 });

worker.on('completed', job => {
  console.log(`${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`${job.id} has failed with ${err.message}`);
});

console.log('Node.js BullMQ Worker started.');
