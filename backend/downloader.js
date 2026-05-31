const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const path = require('path');
const fs = require('fs');

let activeBrowser = null;
let activeContext = null;
let activePage = null;

async function getBrowserPage(jobId, jobs) {
    if (activePage && !activePage.isClosed()) {
        return { browser: activeBrowser, context: activeContext, page: activePage };
    }
    
    // Always use real browser in monolith for CAPTCHAs
    jobs[jobId].stage = 'downloading';
    jobs[jobId].message = 'Launching REAL BROWSER mode (Headed)...';
    
    const userDataDir = path.join(__dirname, 'real_browser_profile');
    activeContext = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        channel: 'chrome',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        viewport: { width: 1920, height: 1080 }
    });
    activePage = activeContext.pages().length > 0 ? activeContext.pages()[0] : await activeContext.newPage();
    
    return { browser: activeBrowser, context: activeContext, page: activePage };
}

async function cleanupBrowser() {
    if (activeContext) {
        try { await activeContext.close(); } catch(e){}
    } else if (activeBrowser) {
        try { await activeBrowser.close(); } catch(e){}
    }
    activeBrowser = null;
    activeContext = null;
    activePage = null;
}

async function downloadResearch(url, outputDir, jobId, jobs) {
    let finalPdfPath;
    const slug = url.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    
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
                    jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Checking PMC database for PMID ${pmid}...`;
                    const convRes = await fetch(`https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json`);
                    const convData = await convRes.json();
                    if (convData.records && convData.records[0] && convData.records[0].pmcid) {
                        pmcid = convData.records[0].pmcid;
                        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Found ${pmcid} for PMID ${pmid}.`;
                    }
                }
                
                if (pmcid) {
                    jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Attempting AWS S3 Open Data fetch for ${pmcid}...`;
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
                                            jobs[jobId].stage = 'downloading'; jobs[jobId].message = `AWS S3 PDF downloaded successfully.`;
                                            return finalPdfPath;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    jobs[jobId].stage = 'downloading'; jobs[jobId].message = `S3 failed, trying canonical endpoint...`;
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
                            jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Canonical PDF downloaded successfully.`;
                            return finalPdfPath;
                        }
                    }
                }
            } catch (err) {
                jobs[jobId].stage = 'downloading'; jobs[jobId].message = `PMC direct download failed, falling back...`;
            }
        } else {
            finalPdfPath = path.join(outputDir, `Research_${slug}.pdf`);
        }
    } else {
        finalPdfPath = path.join(outputDir, `Research_${slug}.pdf`);
    }

    try {
        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Fetching ${url} to check content type...`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            },
            redirect: 'follow'
        });

        if (res.ok) {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/pdf')) {
                jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Direct PDF detected, saving...`;
                const buffer = Buffer.from(await res.arrayBuffer());
                if (buffer.length >= 4 && buffer.toString('utf8', 0, 4) === '%PDF') {
                    fs.writeFileSync(finalPdfPath, buffer);
                    jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Direct PDF downloaded successfully.`;
                    return finalPdfPath;
                } else {
                    jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Downloaded PDF is invalid, falling back...`;
                }
            }
        }
    } catch (err) {
        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Fetch failed, falling back to browser...`;
    }

    let page;
    try {
        const browserSession = await getBrowserPage(jobId, jobs);
        page = browserSession.page;
        
        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Loading ${url} in browser...`;
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Waiting for dynamic content...`;
        await page.waitForTimeout(3000);

        const pageTitle = await page.title();
        const content = await page.content();
        
        const captchaKeywords = ['Just a moment...', 'Attention Required!', 'verify you are human', 'Cloudflare', 'Are you a robot', 'Access Denied', 'Security Measure', 'Suspicious activity', 'Checking your browser', 'challenges.cloudflare.com'];
        let hitCaptcha = captchaKeywords.some(kw => pageTitle.toLowerCase().includes(kw.toLowerCase()) || content.toLowerCase().includes(kw.toLowerCase()));

        if (hitCaptcha) {
            jobs[jobId].stage = 'downloading'; jobs[jobId].message = `CAPTCHA Detected! Please solve it in the Chrome window. Waiting 10m...`;
            
            let solved = false;
            for (let i = 0; i < 600; i++) { 
                if (jobs[jobId].isCancelled) {
                    throw new Error('Job force stopped by user');
                }
                if (jobs[jobId].captchaSolved) {
                    jobs[jobId].captchaSolved = false; 
                    solved = true;
                    break;
                }
                
                await page.waitForTimeout(1000);
                try {
                    await page.title(); 
                } catch (e) {
                }
            }
            
            if (!solved) {
                throw new Error('CAPTCHA not solved in time.');
            }
            
            jobs[jobId].stage = 'downloading'; jobs[jobId].message = `CAPTCHA solved! Continuing...`;
            await page.waitForTimeout(3000);
        }

        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Printing webpage to PDF...`;
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
        
        if (pdfBuffer.length >= 4 && pdfBuffer.toString('utf8', 0, 4) === '%PDF') {
            fs.writeFileSync(finalPdfPath, pdfBuffer);
            return finalPdfPath;
        } else {
            jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Failed to generate a valid PDF from browser.`;
            return null;
        }
    } catch (error) {
        jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Browser failed (${error.message}). Attempting Jina AI extraction...`;
        
        try {
            const jinaUrl = `https://r.jina.ai/${url}`;
            const jinaRes = await fetch(jinaUrl);
            const markdown = await jinaRes.text();
            
            if (markdown && markdown.length > 50) {
                jobs[jobId].stage = 'downloading'; jobs[jobId].message = `Extracted text via Jina, building PDF...`;
                const browserSession = await getBrowserPage(jobId, jobs);
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
