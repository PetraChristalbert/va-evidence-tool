const { PDFDocument, rgb } = require('pdf-lib');
const fs = require('fs');
const { exec } = require('child_process');

async function compressPdfIfLarge(filePath) {
    return new Promise((resolve) => {
        try {
            const stats = fs.statSync(filePath);
            const fileSizeMB = stats.size / (1024 * 1024);
            
            if (fileSizeMB > 9.5) { // Threshold at 9.5MB to be safe
                console.log(`PDF size is ${fileSizeMB.toFixed(2)}MB (over 10MB limit). Compressing...`);
                const tempPath = filePath + '.tmp.pdf';
                // /ebook is 150dpi - good balance of quality and size
                const gsCmd = `gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${tempPath}" "${filePath}"`;
                
                exec(gsCmd, (error) => {
                    if (error) {
                        console.error('Ghostscript compression failed:', error);
                        // If it fails, just keep the original file and don't break the pipeline
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                        return resolve(false);
                    }
                    // Overwrite original with compressed
                    fs.renameSync(tempPath, filePath);
                    const newStats = fs.statSync(filePath);
                    console.log(`Successfully compressed PDF to ${(newStats.size / (1024 * 1024)).toFixed(2)}MB`);
                    resolve(true);
                });
            } else {
                resolve(false);
            }
        } catch (e) {
            console.error('Error during compression check:', e);
            resolve(false);
        }
    });
}

async function buildConditionPacket(esfPath, researchPdfPaths, outputPath, vetName, condition, ssn) {
    try {
        // Load the ESF
        const esfBytes = fs.readFileSync(esfPath);
        const esfDoc = await PDFDocument.load(esfBytes);
        
        try {
            const form = esfDoc.getForm();
            form.getCheckBox('F[0].#subform[1].#field[66]').check();
            form.getTextField('F[0].#subform[1].Other_Describe[0]').setText(`${condition} Research Document Attached`);
        } catch (e) {
            console.error('Failed to fill ESF form fields:', e);
            // Fallback manual draw
            const pages = esfDoc.getPages();
            if (pages.length > 0) {
                const page = pages[0];
                const { height } = page.getSize();
                page.drawText('X', { x: 50, y: height - 600, size: 12, color: rgb(0, 0, 0) });
                page.drawText(`${condition} Research Document Attached`, { x: 70, y: height - 600, size: 10, color: rgb(0, 0, 0) });
            }
        }

        // Create the final merged document
        const finalDoc = await PDFDocument.create();
        
        // Copy ESF pages
        const copiedEsfPages = await finalDoc.copyPages(esfDoc, esfDoc.getPageIndices());
        copiedEsfPages.forEach((page) => finalDoc.addPage(page));
        const esfPagesCount = copiedEsfPages.length;

        // Copy Research PDFs
        for (const pdfPath of researchPdfPaths) {
            if (fs.existsSync(pdfPath)) {
                const pdfBytes = fs.readFileSync(pdfPath);
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const copiedPages = await finalDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
                copiedPages.forEach((page) => finalDoc.addPage(page));
            }
        }

        // Format Header Text
        const nameParts = (vetName || "UNKNOWN").trim().split(/\s+/);
        let lastName = nameParts.length > 0 ? nameParts[nameParts.length - 1] : '';
        let firstName = nameParts.length > 1 ? nameParts[0] : '';
        let middleName = nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : '';
        
        const headerText = `${lastName.toUpperCase()} ${firstName.toUpperCase()} ${middleName.toUpperCase()} | SSN: ${ssn || '000-00-0000'}`;

        // Add Header to Research PDFs (Skip ESF pages)
        const totalPages = finalDoc.getPageCount();
        for (let i = esfPagesCount; i < totalPages; i++) {
            const p = finalDoc.getPage(i);
            const { width, height } = p.getSize();
            p.drawText(headerText, {
                x: width - 250,
                y: height - 30,
                size: 10,
                color: rgb(0, 0, 0)
            });
        }

        // Save the merged document
        const mergedPdfBytes = await finalDoc.save();
        fs.writeFileSync(outputPath, mergedPdfBytes);
        
        // Final compression step if over 10MB limit
        await compressPdfIfLarge(outputPath);
        
        return true;
    } catch (error) {
        console.error(`Failed to build packet for ${condition}:`, error);
        return false;
    }
}

module.exports = { buildConditionPacket };
