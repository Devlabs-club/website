import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';

export async function generateCertificate(participantName: string): Promise<Uint8Array> {
  // Load template PDF
  const templatePath = path.join(process.cwd(), 'public/certificates/devhouse_template.pdf');
  const templateBytes = fs.readFileSync(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);

  pdfDoc.registerFontkit(fontkit);
  
  // Get first page
  const page = pdfDoc.getPages()[0];
  const fontPath = path.join(process.cwd(), 'public/certificates/fonts/DancingScript.ttf');
  const fontBytes = fs.readFileSync(fontPath);
  const font = await pdfDoc.embedFont(fontBytes);
  
  // Add participant name (coordinates to be determined from template)
  page.drawText(participantName, {
    x: 62, // Adjust based on template design
    y: 300, // Adjust based on template design
    size: 60, // Slightly larger for better cursive effect
    font: font,
    color: rgb(0, 0, 0),
  });
  
  // Return PDF bytes
  return await pdfDoc.save();
}
