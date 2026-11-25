// Builds the exact agreement text presented to a family (in their language AND in English) for form 1.3.0-E2.
// The SAME function renders the contract on screen (app.js) and builds the signed evidence on the server, so the stored text
// is the text the parent saw. The server stores it encrypted with a SHA-256 hash; it is never regenerated for an old application.
import { CONTRACT, POLICIES } from './agreements.mjs';

// Structured view of the contract for one language: used by the browser to render and by the server to record.
export function contractView(L, data) {
  const pfcc = data['c.payment'] === 'pfcc';
  return {
    title: L.ct.title,
    version: CONTRACT.version,
    sections: CONTRACT.sections.map(s => ({
      id: s.id, status: s.status,
      title: L.ct[s.id].title,
      label: s.status === 'final' ? L.ui.ctFinal : L.ui.ctPending,
      paragraphs: s.status === 'final' ? [...L.ct[s.id].p] : [L.ui.ctPendingNote],
      note: (s.id === 'pfcc' || s.id === 'copayDelinquency') && !pfcc ? L.ui.ctNotPfcc : null,
    })),
  };
}

const lines = v => [`${v.title} — ${v.version}`, ...v.sections.flatMap(s => [`## ${s.title} [${s.label}]`, ...(s.note ? [s.note] : []), ...s.paragraphs])].join('\n');
const choice = (L, id, v) => (v === undefined ? '' : `${L.f[id]}: ${typeof v === 'boolean' ? (v ? L.ui.yes : L.ui.no) : (L.o[id]?.[v] ?? L.o._?.[v] ?? v)}`);

// Returns one record per agreement. `text` = family language, `textEn` = English source of the same agreement.
export function agreementTexts({ L, EN, data, acks = [], lang }) {
  const both = fn => ({ text: fn(L), textEn: fn(EN) });
  const pfcc = data['c.payment'] === 'pfcc';
  const contract = both(X => [lines(contractView(X, data)),
    ...(pfcc ? [`## ${X.ui.pfHeading}`, ...['pf.auth', 'pf.copay', 'pf.copayAmt', 'pf.dueDay', 'pf.ack'].map(id => choice(X, id, data[id])).filter(Boolean)] : []),
    ...(data['lp.ack'] !== undefined ? [choice(X, 'lp.ack', data['lp.ack'])] : []),
    choice(X, 'ag.contractAck', data['ag.contractAck'])].join('\n'));
  const wt = both(X => [X.ui.wtHeading, X.ui.wtMeta.replace('{r}', POLICIES.withdrawal.revision).replace('{d}', POLICIES.withdrawal.effectiveDate), `${X.f['ag.wt']}: ${X.o['ag.wt'][data['ag.wt']] ?? ''}`].join('\n'));
  const att = both(X => [X.ui.absenceTitle, X.ui.absP1, X.ui.absP2, X.ui.absH1, X.ui.absP3, X.ui.absP4, X.ui.absP5, X.ui.absH2, X.ui.absP6, X.ui.absP7, choice(X, 'ag.absenceAck', data['ag.absenceAck'])].join('\n'));
  const ack = both(X => acks.map(a => '[x] ' + X.acks[a]).join('\n'));
  return [
    { kind: 'contract', version: CONTRACT.version, language: lang, status: CONTRACT.sections.every(s => s.status === 'final') ? 'final' : 'partial', ...contract },
    { kind: 'withdrawal-termination', version: POLICIES.withdrawal.revision, language: lang, status: data['ag.wt'] === 'ack' ? 'acknowledged' : 'not_received', ...wt },
    { kind: 'attendance', version: POLICIES.attendance.revision, language: lang, status: data['ag.absenceAck'] === true ? 'acknowledged' : 'not_acknowledged', ...att },
    { kind: 'acknowledgments', version: 'form ' + (data.__formVersion || ''), language: lang, status: 'accepted', ...ack },
  ];
}

// Individual financial terms as reported in the application (never "confirmed" at submission).
export function reportedTerms(data) {
  if (data['c.payment'] !== 'pfcc') return { payment_type: data['c.payment'] ?? null, pfcc_status: null, copay_cents: null, copay_source: 'none', due_day: null, status: 'not_applicable' };
  const amt = data['pf.copay'] === 'amount' ? Math.round(Number(String(data['pf.copayAmt']).replace(/[$\s]/g, '')) * 100) : data['pf.copay'] === 'zero' ? 0 : null;
  return { payment_type: 'pfcc', pfcc_status: data['pf.auth'] ?? null, copay_cents: Number.isFinite(amt) ? amt : null, copay_source: amt === null ? 'none' : 'parent_reported', due_day: data['pf.dueDay'] ?? null, status: amt === null ? 'awaiting_confirmation' : 'parent_reported' };
}
export const copayStatus = data => data['c.payment'] !== 'pfcc' ? 'not_pfcc' : data['pf.copay'] === 'amount' ? 'parent_reported' : data['pf.copay'] === 'zero' ? 'zero_reported' : 'unknown';
