import type { OutreachNote } from './types.js';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function formatNote(note: OutreachNote, format: 'html' | 'text'): string {
  if (format === 'text') return `[Outreach ${note.templateId}]\nEmne: ${note.subject}\n\n${note.body}`;
  return (
    `<p><b>Outreach genereret</b> (skabelon: ${escapeHtml(note.templateId)})</p>` +
    `<p><b>Emne:</b> ${escapeHtml(note.subject)}</p>` +
    `<p>${escapeHtml(note.body).replace(/\n/g, '<br>')}</p>`
  );
}
