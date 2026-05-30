const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function buildConditionPacket(esfPath, researchPdfPaths, outputPath, vetName, condition, ssn) {
    try {
        // Load the ESF
        const esfBytes = fs.readFileSync(esfPath);
        const esfDoc = await PDFDocument.load(esfBytes);
        
        try {
            const form = esfDoc.getForm();
            form.getCheckBox('F[0].#subform[1].#field[66]').check();
            form.getTextField('F[0].#subform[1].Other_Describe[0]').setText(`${condition} Research Document Attached`);
            
            // Set Date Signed
            const today = new Date();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            const yyyy = String(today.getFullYear());
            
            // Attempt to fill all signature date fields to be safe (indices 0, 1, 2)
            for (let i = 0; i < 3; i++) {
                try { form.getTextField(`F[0].#subform[1].Date_Signed_Month[${i}]`).setText(mm); } catch(e){}
                try { form.getTextField(`F[0].#subform[1].Date_Signed_Day[${i}]`).setText(dd); } catch(e){}
                try { form.getTextField(`F[0].#subform[1].Date_Signed_Year[${i}]`).setText(yyyy); } catch(e){}
            }
            
            // Flatten the form to bake the values visually into the page
            form.flatten();
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
        
        // Ensure SSN is formatted as XXX XX XXXX
        const ssnDigits = (ssn || '000000000').replace(/\D/g, '');
        const formattedSsn = ssnDigits.length === 9 
            ? `${ssnDigits.slice(0,3)} ${ssnDigits.slice(3,5)} ${ssnDigits.slice(5,9)}` 
            : ssn;
        
        const headerText = `${lastName.toUpperCase()} ${firstName.toUpperCase()} ${middleName.toUpperCase()} | SSN: ${formattedSsn}`;

        // Embed a standard font to measure text width
        const font = await finalDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = 10;
        const textWidth = font.widthOfTextAtSize(headerText, fontSize);

        // Add Header to Research PDFs (Skip ESF pages)
        const totalPages = finalDoc.getPageCount();
        for (let i = esfPagesCount; i < totalPages; i++) {
            const p = finalDoc.getPage(i);
            const { width, height } = p.getSize();
            // Half the spacing to the top (was height - 30 -> height - 15)
            // Exactly 30 points from the right edge, calculating based on string width
            p.drawText(headerText, {
                x: width - textWidth - 30,
                y: height - 15,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0)
            });
        }

        // Save the merged document
        const mergedPdfBytes = await finalDoc.save();
        fs.writeFileSync(outputPath, mergedPdfBytes);
        
        return true;
    } catch (error) {
        console.error(`Failed to build packet for ${condition}:`, error);
        return false;
    }
}

module.exports = { buildConditionPacket };
