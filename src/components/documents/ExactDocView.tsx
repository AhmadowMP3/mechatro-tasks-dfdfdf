// A document imported from Word in exact-layout mode: the page shows the PDF
// the Word engine renders (with the Mechatro letterhead on top) instead of the
// editor. Letterhead fields (number, dates, client, language) still come from
// the document settings above, and the PDF follows them.

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileDown, Loader2, PencilLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import type { BusinessDoc } from "@/lib/docs/docs-api";
import type { DocFooter, DocHeader } from "@/lib/docs/types";
import { docTypeLabel } from "@/lib/docs/types";
import {
  buildExactPdf,
  downloadWordSource,
  exactErrorMessage,
  exactPdfFilename,
  letterheadFor,
  savePdf,
  type ExactPdfCache,
} from "@/lib/docs/word-exact/exact-pdf";

type Props = {
  ar: boolean;
  doc: BusinessDoc;
  header: DocHeader;
  footer: DocFooter;
  /** Status pill, import and save buttons from the page. */
  actions: React.ReactNode;
  onOpenEditor: () => void;
  onDownloaded?: () => void;
};

export function ExactDocView({ ar, doc, header, footer, actions, onOpenEditor, onDownloaded }: Props) {
  const source = doc.model.wordImport;
  const letterhead = useMemo(() => letterheadFor(doc, header, footer), [doc, header, footer]);
  const key = JSON.stringify([source?.sourcePath, letterhead]);

  const [pdf, setPdf] = useState<Uint8Array | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const cache = useRef<ExactPdfCache>({});

  // A different source file means a different Word render.
  useEffect(() => { cache.current = {}; }, [source?.sourcePath]);

  useEffect(() => {
    if (!source) return;
    let alive = true;
    setBusy(true);
    setError(null);
    const t = setTimeout(() => {
      downloadWordSource(source.sourcePath)
        .then((buf) => buildExactPdf(buf, letterhead, {
          cache: cache.current,
          title: `${docTypeLabel(doc.doc_type, doc.lang)} ${doc.number}`,
        }))
        .then((res) => {
          if (!alive) return;
          setPdf(res.pdf);
          setPages(res.pages);
          setUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return URL.createObjectURL(new Blob([new Uint8Array(res.pdf)], { type: "application/pdf" }));
          });
        })
        .catch((e) => { if (alive) setError(exactErrorMessage(e, ar)); })
        .finally(() => { if (alive) setBusy(false); });
    }, 600);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, run]);

  const urlRef = useRef<string | null>(null);
  urlRef.current = url;
  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);

  const download = () => {
    if (!pdf) return;
    savePdf(pdf, exactPdfFilename(doc));
    onDownloaded?.();
  };

  const openEditor = () => {
    const ok = window.confirm(
      ar
        ? "سيتم فتح نسخة قابلة للتعديل من الملف. هذه النسخة أقل دقة من ملف Word الأصلي، وسيُستخدم المحرر بدل التنسيق الدقيق. متابعة؟"
        : "This opens an editable copy of the file. It is less accurate than the original Word file, and the editor will replace the exact layout. Continue?",
    );
    if (ok) {
      onOpenEditor();
      toast.message(ar ? "تم فتح النسخة القابلة للتعديل — لا تنسَ الحفظ" : "Editable copy opened — remember to save");
    }
  };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--card)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, marginInlineEnd: "auto" }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>
            {ar ? "تنسيق Word الدقيق" : "Exact Word layout"}
            {pages > 0 && <span style={{ fontWeight: 600, color: "var(--muted-foreground)" }}> · {ar ? `${pages} صفحة` : `${pages} page${pages === 1 ? "" : "s"}`}</span>}
          </span>
          <span style={{ fontSize: 11.5, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {source?.fileName || (ar ? "ملف Word" : "Word file")}
            {" — "}
            {ar ? "لتعديل المحتوى عدّل ملف Word واستورده من جديد." : "To change the content, edit the Word file and import it again."}
          </span>
        </div>
        {actions}
        <button className="btn-ghost" onClick={() => setRun((n) => n + 1)} disabled={busy}>
          <RefreshCw size={15} /> {ar ? "تحديث" : "Refresh"}
        </button>
        <button className="btn-ghost" onClick={openEditor}>
          <PencilLine size={15} /> {ar ? "فتح في المحرر" : "Open in editor"}
        </button>
        <button className="btn-primary" onClick={download} disabled={!pdf || busy}>
          {busy ? <Loader2 size={15} className="spin" /> : <FileDown size={15} />} PDF
        </button>
      </div>

      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", fontSize: 12.5, background: "#F0676A14", borderBottom: "1px solid var(--border)" }}>
          <AlertTriangle size={15} style={{ color: "#F0676A", flexShrink: 0, marginTop: 2 }} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ position: "relative", height: "min(82vh, 1200px)", background: "var(--surface-2, var(--background))" }}>
        {url && (
          <iframe
            title={ar ? "معاينة PDF" : "PDF preview"}
            src={`${url}#view=FitH`}
            style={{ width: "100%", height: "100%", border: 0, display: "block", opacity: busy ? 0.4 : 1 }}
          />
        )}
        {busy && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 13, fontWeight: 700 }}>
            <Loader2 size={20} className="spin" style={{ color: "var(--primary)" }} />
            {ar ? "محرّك Word يجهّز المستند…" : "The Word engine is preparing the document…"}
          </div>
        )}
      </div>
    </div>
  );
}
