const { downloadResearch, cleanupBrowser } = require('./downloader');
const { buildConditionPacket } = require('./pdfBuilder');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const { jobs } = require('./state');

if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = class DOMMatrix {};
}
const pdfParse = require('pdf-parse');

const OUTPUT_DIR = path.join(__dirname, 'output');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

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

async function runExtraction(jobId, memoPath) {
    jobs[jobId] = { status: 'processing', stage: 'extract', type: 'extract' };
    try {
        const fullPath = memoPath ? path.join(UPLOADS_DIR, memoPath) : null;
        const text = await extractText(fullPath);
        
        if (!text) {
            jobs[jobId].status = 'done';
            jobs[jobId].condition_packets = {
                vet_name: "Unknown Veteran",
                va_file_number: "",
                illnesses_clean: ["Unknown Condition"],
                urls: {}
            };
            return;
        }

        const nameMatch = text.match(/Veteran\s+([A-Z][a-zA-Z'\-]+(?:\s+[A-Z]\.?)?\s+[A-Z][a-zA-Z'\-]+)/);
        const vet_name = nameMatch ? nameMatch[1].trim() : "Unknown Veteran";

        const fileNumMatch = text.match(/\b(0\d{8})\b/) || text.match(/\b(\d{3})[\s\-](\d{3})[\s\-](\d{3})\b/);
        const va_file_number = fileNumMatch ? fileNumMatch[0].replace(/[^\d]/g, '') : "000000000";

        // Tokenize the document into strict, isolated blocks by the heading.
        const chunkRegex = /(?=Memorandum\s+in\s+Support\s+of\s+(?:a\s+)?Supplemental\s+Claim)/gi;
        const sections = text.split(chunkRegex);

        const illnesses = new Set();
        const urls = {};

        const conditionTitleRegex = /Memorandum\s+in\s+Support\s+of\s+(?:a\s+)?Supplemental\s+Claim\s+([^\n\r]+)/i;
        // Match links and ensure it stops reading at a space or a closing bracket
        const urlRegex = /https?:\/\/[^\s\]\)]+/g;

        for (const section of sections) {
            // Skip empty strings
            if (!section.trim()) continue;

            const titleMatch = section.match(conditionTitleRegex);
            
            if (titleMatch) {
                // Clean up the extracted condition string (strip any bracketed tags like [Pact Exam Exclusion...])
                let conditionName = titleMatch[1].trim();
                conditionName = conditionName.replace(/\s*\[.*?\]\s*/g, '').trim();

                illnesses.add(conditionName);

                // Extract links strictly within this isolated string block
                const matchedLinks = section.match(urlRegex) || [];
                
                if (!urls[conditionName]) {
                    urls[conditionName] = [];
                }
                
                // Deduplicate links using Set
                urls[conditionName] = [...new Set([...urls[conditionName], ...matchedLinks])];
            }
        }
        
        jobs[jobId].status = 'done';
        jobs[jobId].condition_packets = {
          vet_name,
          va_file_number,
          illnesses_clean: Array.from(illnesses).length ? Array.from(illnesses) : ["Unknown Condition"],
          urls
        };
    } catch (e) {
        console.error('Extraction failed', e);
        jobs[jobId].status = 'error';
    }
}

async function runProcessing(jobId, jobData) {
    const { vet_name, va_file_number, conditions, manualFiles, manualLinks, esfFilename, sigFilename } = jobData;
    jobs[jobId] = { 
        status: 'processing', 
        stage: 'downloading', 
        type: 'process-pdf', 
        message: 'Starting pipeline...',
        isCancelled: false,
        captchaSolved: false,
        condition_packets: {}
    };

    const condition_packets = {};

    try {
        for (const cond of conditions) {
            if (jobs[jobId].isCancelled) throw new Error('Job force stopped by user');
            
            jobs[jobId].current_condition = cond;
            jobs[jobId].message = `Processing ${cond}`;

            const slug = cond.replace(/\W+/g, '_');
            const finalPdfPath = path.join(OUTPUT_DIR, `${vet_name} - ESF - Medical Research - ${cond}.pdf`);
            
            const researchPdfs = []; 
            if (manualFiles && manualFiles[cond] && Array.isArray(manualFiles[cond])) {
              for (const file of manualFiles[cond]) {
                 researchPdfs.push(path.join(UPLOADS_DIR, file));
              }
            }
            
            if (manualLinks && manualLinks[cond] && Array.isArray(manualLinks[cond])) {
              for (const url of manualLinks[cond]) {
                 if (jobs[jobId].isCancelled) throw new Error('Job force stopped by user');
                 
                 const downloadedPdf = await downloadResearch(url, OUTPUT_DIR, jobId, jobs);
                 if (downloadedPdf) {
                   researchPdfs.push(downloadedPdf);
                 }
              }
            }

            jobs[jobId].stage = 'merging';
            jobs[jobId].message = `Merging ${cond} packet`;
            
            let esfPath = esfFilename ? path.join(UPLOADS_DIR, esfFilename) : null;
            let sigPath = sigFilename ? path.join(UPLOADS_DIR, sigFilename) : null;
            
            if (!esfPath || !fs.existsSync(esfPath)) {
              esfPath = path.join(UPLOADS_DIR, 'blank_esf.pdf');
              if (!fs.existsSync(esfPath)) {
                const { PDFDocument } = require('pdf-lib');
                const doc = await PDFDocument.create();
                doc.addPage();
                fs.writeFileSync(esfPath, await doc.save());
              }
            }

            await buildConditionPacket(esfPath, researchPdfs, finalPdfPath, vet_name, cond, va_file_number, sigPath);
            condition_packets[cond] = finalPdfPath;
        }

        jobs[jobId].status = 'done';
        jobs[jobId].stage = 'done';
        jobs[jobId].message = 'All packets generated successfully.';
        jobs[jobId].condition_packets = condition_packets;

        // Save to history
        try {
            const historyPath = path.join(OUTPUT_DIR, 'history.json');
            let historyData = [];
            if (fs.existsSync(historyPath)) {
                historyData = JSON.parse(fs.readFileSync(historyPath));
            }
            historyData.unshift({
                jobId,
                date: new Date().toISOString(),
                vet_name,
                va_file_number,
                conditions,
                packets: condition_packets,
                esfFilename,
                sigFilename
            });
            fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2));
        } catch(err) {
            console.error('Failed to save history', err);
        }
    } catch (e) {
        console.error('Processing failed', e);
        jobs[jobId].status = 'error';
        jobs[jobId].message = e.message;
    } finally {
        await cleanupBrowser();
    }
}

module.exports = {
    runExtraction,
    runProcessing
};
