// Export a single note to a branded PDF using html2canvas + jsPDF.
// Renders a hidden branded template with the note content, then captures it.

import { renderAndDownloadPdf } from "./pdf-render";
import type { Note, NoteTag } from "./notes";
import logoUrl from "@/assets/mechatro-logo.png";

type Params = {
  note: Note;
  authorName: string;
  folderName: string | null;
  tags: NoteTag[];
  lang: "ar" | "en";
};

export async function exportNoteToPdf(p: Params): Promise<void> {
  const { note, authorName, folderName, tags, lang } = p;
  const isAr = lang === "ar";
  const date = new Date(note.updated_at).toLocaleString(isAr ? "ar" : "en-GB", { dateStyle: "long", timeStyle: "short" });

  const doc = (
    <div dir={isAr ? "rtl" : "ltr"} style={{
      fontFamily: isAr ? "'Almarai', 'Segoe UI', sans-serif" : "'Montserrat', 'Segoe UI', sans-serif",
      width: 794, minHeight: 1123, background: "#ffffff", color: "#0F172A",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)",
        padding: "28px 40px", color: "#fff",
        display: "flex", alignItems: "center", gap: 20, justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, letterSpacing: 1.5, fontWeight: 700 }}>MECHATRO</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{isAr ? "ملاحظة" : "Note"}</div>
        </div>
        <img src={logoUrl} alt="Mechatro" crossOrigin="anonymous" style={{ height: 56, filter: "brightness(0) invert(1)" }} />
      </div>

      {/* Body */}
      <div style={{ padding: "32px 40px", flex: 1 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 12px", color: "#0F172A" }}>
          {note.title || (isAr ? "بدون عنوان" : "Untitled")}
        </h1>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, fontSize: 12, color: "#64748B" }}>
          <span><strong>{isAr ? "الكاتب:" : "Author:"}</strong> {authorName}</span>
          <span>•</span>
          <span><strong>{isAr ? "التاريخ:" : "Date:"}</strong> {date}</span>
          {folderName && (<><span>•</span><span><strong>{isAr ? "المجلد:" : "Folder:"}</strong> {folderName}</span></>)}
        </div>

        {tags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
            {tags.map((tag) => (
              <span key={tag.id} style={{
                fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: "rgba(59,130,246,.1)", color: "#3B82F6", border: "1px solid rgba(59,130,246,.3)",
              }}>#{tag.name}</span>
            ))}
          </div>
        )}

        <div style={{ height: 1, background: "linear-gradient(90deg,#3B82F6,transparent)", margin: "8px 0 20px" }} />

        <div
          className="note-pdf-content"
          style={{ fontSize: 14, lineHeight: 1.8, color: "#1E293B" }}
          dangerouslySetInnerHTML={{ __html: note.content_html || `<p style="color:#94A3B8">${isAr ? "لا يوجد محتوى" : "No content"}</p>` }}
        />
      </div>

      {/* Footer */}
      <div style={{
        padding: "16px 40px", borderTop: "2px solid #3B82F6",
        display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748B",
        marginTop: "auto",
      }}>
        <div>Mechatro © {new Date().getFullYear()}</div>
        <div>{isAr ? "أُنشئت في" : "Generated on"} {new Date().toLocaleDateString(isAr ? "ar" : "en-GB")}</div>
      </div>

      <style>{`
        .note-pdf-content h1, .note-pdf-content h2, .note-pdf-content h3 { page-break-after: avoid; break-after: avoid; }
        .note-pdf-content h1 { font-size: 22px; font-weight: 800; margin: 14px 0 8px; color: #0F172A; }
        .note-pdf-content h2 { font-size: 18px; font-weight: 800; margin: 12px 0 6px; color: #0F172A; }
        .note-pdf-content h3 { font-size: 16px; font-weight: 700; margin: 10px 0 4px; color: #0F172A; }
        .note-pdf-content p { margin: 6px 0; }
        .note-pdf-content ul, .note-pdf-content ol { padding-inline-start: 24px; margin: 6px 0; }
        .note-pdf-content ul[data-type="taskList"] { list-style: none; padding-inline-start: 0; }
        .note-pdf-content ul[data-type="taskList"] li { display: flex; gap: 8px; align-items: flex-start; }
        .note-pdf-content ul[data-type="taskList"] li input[type="checkbox"] { margin-top: 5px; }
        .note-pdf-content blockquote { border-inline-start: 3px solid #3B82F6; padding-inline-start: 12px; color: #64748B; margin: 8px 0; }
        .note-pdf-content a { color: #3B82F6; text-decoration: underline; }
        .note-pdf-content img { display: block; max-width: 70%; max-height: 380px; height: auto; object-fit: contain; border-radius: 6px; margin: 12px auto; page-break-inside: avoid; break-inside: avoid; }
        .note-pdf-content code { background: #F1F5F9; padding: 2px 6px; border-radius: 4px; font-size: 12.5px; }
        .note-pdf-content pre { background: #0F172A; color: #F8FAFC; padding: 12px; border-radius: 8px; page-break-inside: avoid; break-inside: avoid; }
      `}</style>
    </div>
  );

  const safe = (note.title || "note").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "_").slice(0, 60) || "note";
  await renderAndDownloadPdf(doc, `${safe}.pdf`);
}
