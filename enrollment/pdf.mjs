// Version 1.2.1 entry point: ONE stored application → TWO independent PDF documents sharing the same application ID.
// Portable (Node 22 / Deno). pdf-lib, fontkit and font bytes are injected.
import { buildOhioPdf, ohioFilename, OHIO_TITLE } from './pdf-ohio.mjs';
import { buildH2hPdf, h2hFilename, H2H_TITLE } from './pdf-h2h.mjs';
import { easternParts } from './pdf-kit.mjs';
export { fmtDate, fmtTime } from './pdf-kit.mjs';
export { ohioFilename, h2hFilename, OHIO_TITLE, H2H_TITLE };

export async function buildEnrollmentPdfs(args) {
  const meta = { ...args.meta, submittedAtEastern: easternParts(args.meta.submittedAt) };
  const a = { ...args, meta };
  const ohio = await buildOhioPdf(a);
  const h2h = await buildH2hPdf(a); // if this throws, nothing is returned: callers never see a half set
  return { ohio, h2h };
}
