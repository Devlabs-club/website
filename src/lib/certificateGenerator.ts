import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';

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

  // --- QR Code Generation ---
  // Convert participant name to URL format (same logic as used for certificate URLs)
  const urlName = participantName
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase();
  const certUrl = `${process.env.WEBSITE_ROOT}/devhouse_25/certificates/${urlName}`;

  // Generate QR code PNG buffer
  const qrPngBuffer = await QRCode.toBuffer(certUrl, { width: 256, margin: 1 });
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);
  const qrDims = qrImage.scale(0.5); // Adjust scale as needed

  // Draw QR code in top-right corner
  page.drawImage(qrImage, {
    x: page.getWidth() - qrDims.width - 40, // 40px margin from right
    y: page.getHeight() - qrDims.height - 40, // 40px margin from top
    width: qrDims.width,
    height: qrDims.height,
  });

  // Add participant name (coordinates to be determined from template)
  page.drawText(participantName, {
    x: 62, // Adjust based on template design
    y: 330, // Adjust based on template design
    size: 60, // Slightly larger for better cursive effect
    font: font,
    color: rgb(0, 0, 0),
  });
  
  // Return PDF bytes
  return await pdfDoc.save();
}
