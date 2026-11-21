import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { sha256Hex } from './tokens';

export interface CertificateContent {
  certificateNumber: string;
  holderName: string;
  enrolmentId: string;
  courseName: string;
  centreName: string;
  districtName: string;
  score: number;
  passedOn: string; // YYYY-MM-DD
  issuedOn: string; // YYYY-MM-DD
}

/**
 * Hash of the canonical certificate data. Printed on the PDF and stored in the DB,
 * so anyone holding a paper copy can check the printed facts were not edited.
 */
export function certificateContentHash(c: CertificateContent): string {
  return sha256Hex(
    JSON.stringify([c.certificateNumber, c.holderName, c.enrolmentId, c.courseName, c.centreName, c.districtName, c.score, c.passedOn, c.issuedOn]),
  );
}

export async function renderCertificatePdf(c: CertificateContent, verifyUrl: string, contentHash: string): Promise<Buffer> {
  const qr = await QRCode.toBuffer(verifyUrl, { errorCorrectionLevel: 'M', margin: 1, width: 300 });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 48,
      info: { Title: `Certificate ${c.certificateNumber}`, Author: 'Pragati Skills Mission', CreationDate: new Date(`${c.issuedOn}T00:00:00Z`) },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { width, height } = doc.page;
    const navy = '#1f3b63';

    doc.rect(24, 24, width - 48, height - 48).lineWidth(3).stroke(navy);
    doc.rect(32, 32, width - 64, height - 64).lineWidth(1).stroke(navy);

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(28).text('Pragati Skills Mission', 48, 70, { align: 'center', width: width - 96 });
    doc.font('Helvetica').fontSize(12).fillColor('#444').text('Skill Development Department (fictional demo programme)', { align: 'center', width: width - 96 });

    doc.moveDown(1.5).font('Helvetica-Bold').fontSize(22).fillColor('#000').text('Certificate of Completion', { align: 'center', width: width - 96 });
    doc.moveDown(0.8).font('Helvetica').fontSize(13).text('This is to certify that', { align: 'center', width: width - 96 });
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(26).fillColor(navy).text(c.holderName, { align: 'center', width: width - 96 });
    doc
      .moveDown(0.4)
      .font('Helvetica')
      .fontSize(13)
      .fillColor('#000')
      .text(`Enrolment ID ${c.enrolmentId}, has successfully completed the course`, { align: 'center', width: width - 96 });
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(18).text(c.courseName, { align: 'center', width: width - 96 });
    doc
      .moveDown(0.4)
      .font('Helvetica')
      .fontSize(12)
      .text(`at ${c.centreName}, ${c.districtName} district, with a score of ${c.score}/100 (passed on ${c.passedOn}).`, {
        align: 'center',
        width: width - 96,
      });

    const footerY = height - 175;
    doc.image(qr, width - 48 - 125, footerY, { width: 115 });
    doc.fontSize(11).fillColor('#000').font('Helvetica-Bold').text(`Certificate No. ${c.certificateNumber}`, 64, footerY + 5);
    doc.font('Helvetica').text(`Issued on ${c.issuedOn}`, 64, footerY + 23);
    doc.text(`Verify: ${verifyUrl}`, 64, footerY + 41, { width: width - 260 });
    doc.fontSize(7).fillColor('#666').text(`Content hash (SHA-256): ${contentHash}`, 64, footerY + 75, { width: width - 260 });
    doc.fontSize(8).text('Scan the QR code to check this certificate is genuine and has not been revoked.', 64, footerY + 95, {
      width: width - 260,
    });

    doc.end();
  });
}
