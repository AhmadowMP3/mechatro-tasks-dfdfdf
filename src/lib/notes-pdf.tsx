// Export a single note to a branded PDF. Only the body is rendered here — the
// unified Mechatro header (logo) and footer (Page X/Y + generated meta) are
// drawn natively by src/lib/pdf/chrome.ts.

import { renderAndDownloadPdf } from "./pdf-render";
import { stampFilename } from "./pdf/brand";
import type { Note, NoteTag } from "./notes";
import { sanitizeHtml } from "@/lib/security/sanitize";

type Params = {
  note: Note;
  authorName: string;
  folderName: string | null;
  tags: NoteTag[];
  lang: "ar" | "en";
};

const navy = "#081320";
const surface = "#0F2031";
const line = "#1E3A57";
const blue = "#42C2EE";
const gold = "#D4A017";
const ink = "#E6EEF7";
const ink2 = "#CBD5E1";
const muted = "#94A3B8";

export async function exportNoteToPdf(p: Params): Promise<void> {
  const { note, authorName, folderName, tags, lang } = p;
  const isAr = lang === "ar";
  const date = new Date(note.updated_at).toLocaleString(
    isAr ? "ar-EG-u-nu-latn" : "en-GB",
    { dateStyle: "long", timeStyle: "short" },
  );

  const doc = (
    <div dir={isAr ? "rtl" : "ltr"} style={{
      fontFamily: isAr
        ? "'Montserrat Arabic', 'Almarai', 'Segoe UI', sans-serif"
        : "'Montserrat', 'Montserrat Arabic', system-ui, sans-serif",
      width: 794, background: navy, color: ink,
      padding: "60px 44px 44px", // top clears native header, bottom clears native footer
      boxSizing: "border-box",
    }}>
      {/* Document title block — matches DocTitle used by finance PDFs */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, letterSpacing: 3, textTransform: "uppercase" }}>
              {isAr ? "ملاحظة" : "NOTE"}
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: "2px 0 0", color: ink, letterSpacing: 0.3 }}>
              {note.title || (isAr ? "بدون عنوان" : "Untitled")}
            </h1>
          </div>
          <div style={{ width: 60, height: 6, background: blue, borderRadius: 3, marginBottom: 8 }} />
        </div>
        <div style={{ height: 1, background: `linear-gradient(90deg, ${blue}, transparent)`, marginTop: 10 }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 10, fontSize: 12, color: muted }}>
        <span><strong style={{ color: ink }}>{isAr ? "الكاتب:" : "Author:"}</strong> {authorName}</span>
        <span>·</span>
        <span><strong style={{ color: ink }}>{isAr ? "التاريخ:" : "Date:"}</strong> {date}</span>
        {folderName && (<><span>·</span><span><strong style={{ color: ink }}>{isAr ? "المجلد:" : "Folder:"}</strong> {folderName}</span></>)}
      </div>

      {tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {tags.map((tag) => (
            <span key={tag.id} style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
              background: "rgba(24,159,209,.1)", color: blue, border: `1px solid ${blue}55`,
            }}>#{tag.name}</span>
          ))}
        </div>
      )}

      <div style={{ height: 4, background: gold, borderRadius: 2, width: 40, margin: "6px 0 18px" }} />

      <div
        className="note-pdf-content"
        style={{ fontSize: 14, lineHeight: 1.85, color: ink }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(note.content_html) || `<p style="color:${muted}">${isAr ? "لا يوجد محتوى" : "No content"}</p>` }}
      />

      <style>{`
        .note-pdf-content h1, .note-pdf-content h2, .note-pdf-content h3 { page-break-after: avoid; break-after: avoid; color: ${ink}; }
        .note-pdf-content h1 { font-size: 22px; font-weight: 800; margin: 14px 0 8px; }
        .note-pdf-content h2 { font-size: 18px; font-weight: 800; margin: 12px 0 6px; }
        .note-pdf-content h3 { font-size: 16px; font-weight: 700; margin: 10px 0 4px; }
        .note-pdf-content p { margin: 6px 0; color: ${ink2}; }
        .note-pdf-content ul, .note-pdf-content ol { padding-inline-start: 24px; margin: 6px 0; color: ${ink2}; }
        .note-pdf-content ul[data-type="taskList"] { list-style: none; padding-inline-start: 0; }
        .note-pdf-content ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
        .note-pdf-content ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 5px; }
        .note-pdf-content blockquote { border-inline-start: 3px solid ${blue}; padding-inline-start: 12px; color: ${muted}; margin: 8px 0; }
        .note-pdf-content a { color: ${blue}; text-decoration: underline; }
        .note-pdf-content img { display: block; max-width: 70%; max-height: 380px; height: auto; object-fit: contain; border-radius: 6px; margin: 12px auto; padding: 6px; background: ${surface}; border: 1px solid ${line}; page-break-inside: avoid; break-inside: avoid; }
        .note-pdf-content code { background: ${surface}; color: ${ink}; padding: 2px 6px; border-radius: 4px; font-size: 12.5px; border: 1px solid ${line}; }
        .note-pdf-content pre { background: ${surface}; color: ${ink}; padding: 12px; border-radius: 8px; border: 1px solid ${line}; page-break-inside: avoid; break-inside: avoid; }
        .note-pdf-content hr { border: 0; border-top: 1px solid ${line}; margin: 12px 0; }
      `}</style>
    </div>
  );

  await renderAndDownloadPdf(doc, stampFilename("note", note.title), {
    chrome: { lang, generatedBy: authorName },
  });
}
