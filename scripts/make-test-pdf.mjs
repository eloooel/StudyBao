/**
 * Generate a minimal, valid, single-page PDF with a real text layer.
 *
 * Test-only. Hand-built rather than checked in as a binary: a short script that explains its own
 * bytes is reviewable, whereas a fixture PDF is not, and the only thing this needs to prove is
 * that PDF.js reads text it did not have to recognise. Its output is gitignored (`.pdf-smoke.pdf`).
 *
 * Usage: node scripts/make-test-pdf.mjs [target]
 */
import { writeFileSync } from 'node:fs'

const target = process.argv[2] ?? '.pdf-smoke.pdf'

const content = `BT /F1 14 Tf 72 720 Td (Vitamin C: ascorbic acid) Tj 0 -22 Td (self-esteem - how a person values themselves) Tj 0 -22 Td (Q1. What is the antidote?) Tj 0 -22 Td (A1. N-acetylcysteine) Tj ET`

const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${String(content.length)} >>\nstream\n${content}\nendstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
]

let pdf = '%PDF-1.4\n'
const offsets = []

objects.forEach((body, index) => {
  offsets.push(pdf.length)
  pdf += `${String(index + 1)} 0 obj\n${body}\nendobj\n`
})

const xrefStart = pdf.length
pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
for (const offset of offsets) {
  pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
}
pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(xrefStart)}\n%%EOF\n`

writeFileSync(target, pdf, 'latin1')
console.log(`wrote ${target} (${String(pdf.length)} bytes)`)
