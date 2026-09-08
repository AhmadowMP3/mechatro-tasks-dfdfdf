// TEMPORARY diagnostic route (dev only) — remove after verifying Word import.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DocEditor } from "@/components/documents/editor/DocEditor";
import { convertDocx } from "@/lib/docs/import-docx";
import { defaultFooter, defaultHeader } from "@/lib/docs/defaults";

export const Route = createFileRoute("/labdoc")({ component: Lab });

function Lab() {
  const [html, setHtml] = useState("<p>loading…</p>");
  useEffect(() => {
    (async () => {
      const res = await fetch("/_lab.docx");
      const buf = await res.blob();
      const file = new File([buf], "lab.docx", {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const out = await convertDocx(file, { keepFormatting: true });
      setHtml(out.html);
      (window as unknown as { __labHtml?: string }).__labHtml = out.html;
    })();
  }, []);
  return (
    <div style={{ padding: 16 }}>
      <DocEditor
        html={html}
        onChange={() => {}}
        lang="ar"
        theme="light"
        currency="SAR"
        meta={{ number: "QT-014", date: "2026-09-06", validUntil: "", title: "عرض سعر" } as never}
        showClientBox={false}
        client={{ name: "شركة البنيان" } as never}
        header={defaultHeader("quotation")}
        footer={defaultFooter("quotation")}
      />
    </div>
  );
}
