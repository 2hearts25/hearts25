import { Buffer } from "node:buffer";

const MAX_ENCODED_ATTACHMENTS = 16 * 1024 * 1024;
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

export type PacketFile = { filename: string; bytes: number; id?: string; path?: string; sha256?: string };

export function supportingFiles(reference: string, wanted: string[], rows: any[], categories: string[]) {
  const selected = new Set(wanted);
  return rows.filter(d => selected.has(d.id) && d.status === "stored" &&
    ["structure_checked", "released"].includes(d.scan) && d.review !== "rejected" &&
    categories.includes(d.category) && EXT[d.mime])
    .map(d => ({ id: d.id, path: d.path, sha256: d.sha256, bytes: d.bytes,
      filename: `${reference}_${d.category}_${d.id}.${EXT[d.mime]}` } as PacketFile))
    .sort((a, b) => a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0);
}

export function packetParts(pdfs: PacketFile[], docs: PacketFile[]) {
  const size = (f: PacketFile) => {
    if (!Number.isSafeInteger(f.bytes) || f.bytes < 1) throw new Error("invalid attachment size");
    return 4 * Math.ceil(f.bytes / 3);
  };
  const parts = [pdfs.slice()];
  let total = pdfs.reduce((n, f) => n + size(f), 0);
  if (total > MAX_ENCODED_ATTACHMENTS) throw new Error("enrollment PDF pair exceeds attachment budget");
  for (const file of docs) {
    const encoded = size(file);
    if (encoded > MAX_ENCODED_ATTACHMENTS) throw new Error("supporting document exceeds attachment budget");
    if (total + encoded > MAX_ENCODED_ATTACHMENTS) {
      parts.push([]);
      total = 0;
    }
    parts[parts.length - 1].push(file);
    total += encoded;
  }
  return parts;
}

export async function packetMessage(reference: string, parts: PacketFile[][], index: number, withheld: number,
  primary: { subject: string; text: string; html: string; attachments: { filename: string; content: string }[] } | null,
  load: (file: PacketFile) => Promise<Uint8Array>) {
  const label = `Packet ${index + 1} of ${parts.length}`;
  const current = parts[index];
  const inventory = `Attachment inventory for ${reference}:\n` + parts.map((files, i) =>
    `Part ${i + 1}: ${files.map(f => f.filename).join(", ")}`).join("\n") +
    (withheld ? `\n${withheld} upload(s) withheld because they did not meet the delivery checks. Contact the enrollment administrator for review.` : "");
  const htmlInventory = (label + "\n" + inventory).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
  const attachments = primary ? primary.attachments.slice() : [];
  for (const f of current.filter(f => f.id)) {
    const bytes = await load(f);
    const content = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");
    attachments.push({ filename: f.filename, content });
  }
  return {
    subject: parts.length === 1 && primary ? primary.subject : `Enrollment application - ${reference} - ${label}`,
    text: [primary?.text, label, inventory, "Confidential enrollment records. Store and share only as needed."].filter(Boolean).join("\n\n"),
    html: (primary?.html ?? "") + `<p>${htmlInventory}</p><p>Confidential enrollment records. Store and share only as needed.</p>`,
    attachments,
  };
}
