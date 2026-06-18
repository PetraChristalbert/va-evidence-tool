const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const path = require('path');
const fs = require('fs');

let activeBrowser = null;
let activeContext = null;
let activePage = null;

async function getBrowserPage(job) {
    if (activePage && !activePage.isClosed()) {
        return { browser: activeBrowser, context: activeContext, page: activePage };
    }
    
    const useRealBrowser = process.env.USE_REAL_BROWSER === 'true';
    if (useRealBrowser) {
        await job.updateProgress({ stage: 'downloading', message: `Launching REAL BROWSER mode (Headed)...` });
        const userDataDir = path.join(__dirname, 'real_browser_profile');
        activeContext = await chromium.launchPersistentContext(userDataDir, {
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            viewport: { width: 1920, height: 1080 }
        });
        activePage = activeContext.pages().length > 0 ? activeContext.pages()[0] : await activeContext.newPage();
    } else {
        activeBrowser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        activeContext = await activeBrowser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });
        activePage = await activeContext.newPage();
    }
    return { browser: activeBrowser, context: activeContext, page: activePage };
}

async function cleanupBrowser() {
    if (process.env.USE_REAL_BROWSER === 'true' && activeContext) {
        try { await activeContext.close(); } catch(e){}
    } else if (activeBrowser) {
        try { await activeBrowser.close(); } catch(e){}
    }
    activeBrowser = null;
    activeContext = null;
    activePage = null;
}

async function downloadResearch(url, outputDir, job, redisClient) {
    let finalPdfPath;
    const slug = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const useRealBrowser = process.env.USE_REAL_BROWSER === 'true';
    const jobId = job.data.jobId;
    
    // 1. Check if it's PubMed/PMC and try native API fetch first
    if (url.includes('pubmed.ncbi.nlm.nih.gov') || url.includes('pmc.ncbi.nlm.nih.gov')) {
        let pmid = null;
        let pmcid = null;
        
        const pmcidMatch = url.match(/PMC(\d+)/i);
        if (pmcidMatch) {
            pmcid = `PMC${pmcidMatch[1]}`;
        } else {
            const pmidMatch = url.match(/\/(\d+)\/?$/);
            pmid = pmidMatch ? pmidMatch[1] : null;
        }
        
        if (pmcid || pmid) {
            finalPdfPath = path.join(outputDir, `${pmcid || 'PMID_' + pmid}.pdf`);
            
            try {
                if (!pmcid && pmid) {
                    await job.updateProgress({ stage: 'downloading', message: `Checking PMC database for PMID ${pmid}...` });
                    const convRes = await fetch(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json`);
                    const convData = await convRes.json();
                    if (convData.records && convData.records[0] && convData.records[0].pmcid) {
                        pmcid = convData.records[0].pmcid;
                        await job.updateProgress({ stage: 'downloading', message: `Found ${pmcid} for PMID ${pmid}.` });
                    }
                }
                
                if (pmcid) {
                    await job.updateProgress({ stage: 'downloading', message: `Attempting AWS S3 Open Data fetch for ${pmcid}...` });
                    const listUrl = `https://pmc-oa-opendata.s3.amazonaws.com/?prefix=${pmcid}.&delimiter=%2F`;
                    const listRes = await fetch(listUrl);
                    if (listRes.ok) {
                        const xmlText = await listRes.text();
                        const prefixes = [...xmlText.matchAll(/<Prefix>(PMC\d+\.\d+(?:\.\d+)?\/)<\/Prefix>/g)].map(m => m[1]);
                        
                        if (prefixes.length > 0) {
                            prefixes.sort((a, b) => parseFloat(b.split('.')[1]) - parseFloat(a.split('.')[1]));
                            for (const prefix of prefixes) {
                                const verKey = prefix.replace(/\/$/, '');
                                const pdfUrls = [
                                    `https://pmc-oa-opendata.s3.amazonaws.com/${verKey}/${verKey}.pdf`,
                                    `https://pmc-oa-opendata.s3.amazonaws.com/${verKey}/${pmcid}.pdf`
                                ];
                                
                                for (const s3Url of pdfUrls) {
                                    const s3Res = await fetch(s3Url, { headers: { 'Accept': 'application/pdf,*/*' }});
                                    if (s3Res.ok) {
                                        const buffer = Buffer.from(await s3Res.arrayBuffer());
                                        if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === '%PDF') {
                                            fs.writeFileSync(finalPdfPath, buffer);
                                            await job.updateProgress({ stage: 'downloading', message: `AWS S3 PDF downloaded successfully.` });
                                            return finalPdfPath;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    await job.updateProgress({ stage: 'downloading', message: `S3 failed, trying canonical endpoint...` });
                    const pdfUrl = `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/pdf/`;
                    const pdfRes = await fetch(pdfUrl, {
                        headers: {
                            'Accept': 'application/pdf,*/*',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
                        }
                    });
                    
                    if (pdfRes.ok) {
                        const buffer = Buffer.from(await pdfRes.arrayBuffer());
                        if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === '%PDF') {
                            fs.writeFileSync(finalPdfPath, buffer);
                            await job.updateProgress({ stage: 'downloading', message: `Canonical PDF downloaded successfully.` });
                            return finalPdfPath;
                        }
                    }
                }
            } catch (err) {
                await job.updateProgress({ stage: 'downloading', message: `PMC direct download failed, falling back...` });
            }
        } else {
            finalPdfPath = path.join(outputDir, `Research_${slug}.pdf`);
        }
    } else {
        finalPdfPath = path.join(outputDir, `Research_${slug}.pdf`);
    }

    // Generic Fetch-First Approach
    try {
        await job.updateProgress({ stage: 'downloading', message: `Fetching ${url} to check content type...` });
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            redirect: 'follow'
        });

        if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/pdf')) {
                await job.updateProgress({ stage: 'downloading', message: `Direct PDF detected, saving...` });
                const buffer = Buffer.from(await res.arrayBuffer());
                if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === '%PDF') {
                    fs.writeFileSync(finalPdfPath, buffer);
                    await job.updateProgress({ stage: 'downloading', message: `Direct PDF downloaded successfully.` });
                    return finalPdfPath;
                } else {
                    await job.updateProgress({ stage: 'downloading', message: `Downloaded PDF is invalid, falling back...` });
                }
            }
        }
    } catch (err) {
        await job.updateProgress({ stage: 'downloading', message: `Fetch failed, falling back to browser...` });
    }

    // 2. Fallback to Browser Print
    let page;
    try {
        const browserSession = await getBrowserPage(job);
        page = browserSession.page;
        
        await job.updateProgress({ stage: 'downloading', message: `Loading ${url} in browser...` });
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await job.updateProgress({ stage: 'downloading', message: `Waiting for dynamic content...` });
        await page.waitForTimeout(3000);

        const pageTitle = await page.title();
        const content = await page.content();
        
        const captchaKeywords = ['Just a moment...', 'Attention Required!', 'verify you are human', 'Cloudflare', 'Are you a robot', 'Access Denied', 'Security Measure', 'Suspicious activity', 'Checking your browser', 'challenges.cloudflare.com'];
        let hitCaptcha = captchaKeywords.some(kw => pageTitle.toLowerCase().includes(kw.toLowerCase()) || content.toLowerCase().includes(kw.toLowerCase()));

        if (hitCaptcha) {
            if (process.env.USE_REAL_BROWSER === 'true') {
                await job.updateProgress({ stage: 'downloading', message: `CAPTCHA Detected! Please solve it in the Chrome window. Waiting 60s...` });
                
                let solved = false;
                for (let i = 0; i < 600; i++) { // Wait up to 10 minutes (600 seconds)
                    if (redisClient) {
                        const isCancelled = await redisClient.get(`cancel_job_${jobId}`);
                        if (isCancelled) {
                            throw new Error('Job force stopped by user');
                        }
                        const isSolved = await redisClient.get(`captcha_solved_${jobId}`);
                        if (isSolved) {
                            await redisClient.del(`captcha_solved_${jobId}`); // clear for next time
                            solved = true;
                            break;
                        }
                    }
                    await page.waitForTimeout(1000);
                    try {
                        // We do not auto-detect anymore because Cloudflare refreshes the page
                        // and causes false positives. We only rely on the 'Continue' button from Redis.
                        await page.title(); // Just a ping to keep connection alive
                    } catch (e) {
                        // Ignore errors
                    }
                }
                
                if (!solved) {
                    throw new Error('CAPTCHA not solved in time.');
                }
                
                await job.updateProgress({ stage: 'downloading', message: `CAPTCHA solved! Continuing...` });
                await page.waitForTimeout(3000); // Let the actual page render
            } else {
                throw new Error('CAPTCHA Detected or Bot Protection hit!');
            }
        }

        await job.updateProgress({ stage: 'downloading', message: `Printing webpage to PDF...` });
        const pdfBuffer = await page.pdf({ 
            format: 'A4', 
            printBackground: false,
            displayHeaderFooter: false,
            margin: {
                top: '0.9in',
                right: '0.42in',
                bottom: '0.39in',
                left: '0.4in'
            }
        });
        
        // Verify magic bytes of the generated PDF
        if (pdfBuffer.length >= 4 && pdfBuffer.toString('utf8', 0, 4) === '%PDF') {
            fs.writeFileSync(finalPdfPath, pdfBuffer);
            return finalPdfPath;
        } else {
            await job.updateProgress({ stage: 'downloading', message: `Failed to generate a valid PDF from browser.` });
            return null;
        }
    } catch (error) {
        await job.updateProgress({ stage: 'downloading', message: `Browser failed (${error.message}). Attempting Jina AI extraction...` });
        
        try {
            const jinaUrl = `https://r.jina.ai/${url}`;
            const jinaRes = await fetch(jinaUrl);
            const markdown = await jinaRes.text();
            
            if (markdown && markdown.length > 50) {
                await job.updateProgress({ stage: 'downloading', message: `Extracted text via Jina, building PDF...` });
                const browserSession = await getBrowserPage(job);
                const htmlPage = browserSession.page;
                
                const htmlContent = `
                    <html>
                    <body style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; word-wrap: break-word;">
                        <h3>Recovered Text Content</h3>
                        <p style="font-size: 12px; color: #555;">Source: ${url}</p>
                        <hr/>
                        <pre style="white-space: pre-wrap; font-family: monospace; font-size: 13px;">${markdown.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                    </body>
                    </html>
                `;
                await htmlPage.setContent(htmlContent);
                const pdfBuffer = await htmlPage.pdf({ 
                    format: 'A4', 
                    printBackground: true,
                    margin: { top: '0.9in', right: '0.4in', bottom: '0.4in', left: '0.4in' }
                });
                
                if (pdfBuffer.length >= 4 && pdfBuffer.toString('utf8', 0, 4) === '%PDF') {
                    fs.writeFileSync(finalPdfPath, pdfBuffer);
                    return finalPdfPath;
                }
            }
        } catch (fallbackError) {
             console.error("Jina fallback failed", fallbackError);
        }
        
        return null;
    }
}

module.exports = { downloadResearch, cleanupBrowser };
