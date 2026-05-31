const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function buildConditionPacket(esfPath, researchPdfPaths, outputPath, vetName, condition, ssn, sigPath) {
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
            
            // Fill ONLY the 19B signature date field (index 2)
            try { form.getTextField(`F[0].#subform[1].Date_Signed_Month[2]`).setText(mm); } catch(e){}
            try { form.getTextField(`F[0].#subform[1].Date_Signed_Day[2]`).setText(dd); } catch(e){}
            try { form.getTextField(`F[0].#subform[1].Date_Signed_Year[2]`).setText(yyyy); } catch(e){}

            // Embed Signature
            if (sigPath && fs.existsSync(sigPath)) {
                try {
                    const pages = esfDoc.getPages();
                    if (pages.length > 1) {
                        const sigBytes = fs.readFileSync(sigPath);
                        let sigImage;
                        if (sigPath.toLowerCase().endsWith('.png')) {
                            sigImage = await esfDoc.embedPng(sigBytes);
                        } else if (sigPath.toLowerCase().match(/\.jpe?g$/)) {
                            sigImage = await esfDoc.embedJpg(sigBytes);
                        }

                        if (sigImage) {
                            // Target Box 19A roughly: x=30, y=155, width=276, height=24
                            // Scale height to ~35 for realistic overflow, calculate width proportionally
                            const scaledDims = sigImage.scaleToFit(999, 35);
                            
                            // Center horizontally in the 276px wide box
                            const boxX = 30;
                            const boxWidth = 276;
                            const boxY = 155;
                            const centeredX = boxX + (boxWidth / 2) - (scaledDims.width / 2);

                            pages[1].drawImage(sigImage, {
                                x: centeredX,
                                y: boxY - 5, // slightly lower to look like it sits on the line
                                width: scaledDims.width,
                                height: scaledDims.height
                            });
                        }
                    }
                } catch(e) {
                    console.log(`[Note] Failed to embed signature: ${e.message}`);
                }
            }

            // Forcefully draw an 'X' over the checkbox's exact coordinates to ensure visibility.
            // Do this BEFORE flatten() because if flatten() throws an error, it corrupts and deletes fields!
            try {
                const pages = esfDoc.getPages();
                if (pages.length > 1) { // Form 20-10208 is 2 pages, box is on page 2
                    const checkboxField = form.getCheckBox('F[0].#subform[1].#field[66]');
                    const checkboxWidget = checkboxField.acroField.getWidgets()[0];
                    if (checkboxWidget) {
                        const rect = checkboxWidget.getRectangle();
                        pages[1].drawText('X', {
                            x: rect.x + 1.5,
                            y: rect.y + 1,
                            size: 9,
                            color: rgb(0, 0, 0)
                        });
                        // Remove the field so its white background doesn't obscure our drawn text
                        form.removeField(checkboxField);
                    }
                }
            } catch(e) {
                console.log(`[Note] Failed to draw checkbox X: ${e.message}`);
            }

            // Flatten the form to bake the values visually into the page
            try {
                form.flatten();
            } catch (flattenError) {
                // Ignore flatten errors (e.g. Unexpected N type: undefined)
            }
        } catch (e) {
            console.log(`[Note] Failed to fill ESF form fields dynamically: ${e.message}`);
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
