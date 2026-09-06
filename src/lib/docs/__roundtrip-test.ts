// Temporary manual test helper (deleted after verification).
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color, FontSize, FontFamily } from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { BlockFormat } from "@/components/documents/editor/text-attrs";

export function roundtrip(html: string): string {
  const ext = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, underline: false }),
    Underline, TextStyle, Color, FontSize, FontFamily, BlockFormat,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Table, TableRow, TableHeader, TableCell,
  ];
  const el = document.createElement("div");
  const e = new Editor({ element: el, extensions: ext, content: html });
  const out = e.getHTML();
  e.destroy();
  return out;
}
