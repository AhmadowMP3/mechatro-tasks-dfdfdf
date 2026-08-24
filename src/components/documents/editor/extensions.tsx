// Custom TipTap nodes for the Word-style document editor:
//   • PageBreak  — a real manual page break honoured by the paginator
//   • DocField   — inline auto field (number / date / totals …)
//   • ItemsTable — the smart items table with automatic totals

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Plus, Trash2 } from "lucide-react";
import { computeItems, money, uid, type ItemRow } from "@/lib/docs/model";
import { DOC_FIELDS, fieldLabel, mergeItemsData, readItemsAttr, writeItemsAttr, emptyItemsData, type ItemsData } from "@/lib/docs/rich";
import type { DocLang } from "@/lib/docs/types";

/* ── Page break ───────────────────────────────────────────────── */

export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML() {
    return ["div", { "data-page-break": "true" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PageBreakView);
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ commands }: { commands: { insertContent: (v: unknown) => boolean } }) =>
          commands.insertContent({ type: this.name }),
    } as never;
  },
});

function PageBreakView() {
  return (
    <NodeViewWrapper>
      <div contentEditable={false} className="doc-page-break-mark">
        <span>— — — — — —</span>
      </div>
    </NodeViewWrapper>
  );
}

/* ── Auto field ───────────────────────────────────────────────── */

export type DocFieldOptions = { lang: DocLang; values: Record<string, string> };

export const DocField = Node.create<DocFieldOptions>({
  name: "docField",
  group: "inline",
  inline: true,
  atom: true,
  addOptions() {
    return { lang: "ar", values: {} };
  },
  addAttributes() {
    return { field: { default: "number" } };
  },
  parseHTML() {
    return [{ tag: "span[data-doc-field]", getAttrs: (el) => ({ field: (el as HTMLElement).getAttribute("data-doc-field") ?? "number" }) }];
  },
  renderHTML({ HTMLAttributes, node }) {
    return [
      "span",
      mergeAttributes({ "data-doc-field": node.attrs.field as string }, HTMLAttributes),
      String(this.options.values[node.attrs.field as string] ?? fieldLabel(node.attrs.field as string, this.options.lang)),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocFieldView);
  },
});

function DocFieldView({ node, extension }: NodeViewProps) {
  const opts = extension.options as DocFieldOptions;
  const key = node.attrs.field as string;
  const value = opts.values[key];
  return (
    <NodeViewWrapper as="span">
      <span className="doc-field-chip" contentEditable={false} title={fieldLabel(key, opts.lang)}>
        {value || fieldLabel(key, opts.lang)}
      </span>
    </NodeViewWrapper>
  );
}

export const DOC_FIELD_LIST = DOC_FIELDS;

/* ── Smart items table ────────────────────────────────────────── */

export type ItemsTableOptions = { lang: DocLang; currency: string };

export const ItemsTable = Node.create<ItemsTableOptions>({
  name: "itemsTable",
  group: "block",
  atom: true,
  draggable: false,
  addOptions() {
    return { lang: "ar", currency: "USD" };
  },
  addAttributes() {
    return {
      data: {
        default: emptyItemsData(),
        parseHTML: (el) => readItemsAttr((el as HTMLElement).getAttribute("data-items")) ?? emptyItemsData(),
        renderHTML: (attrs) => ({ "data-items": writeItemsAttr(mergeItemsData(attrs.data)) }),
      },
    };
  },
  parseHTML() {
    return [{ tag: "table[data-items]" }];
  },
  renderHTML({ HTMLAttributes }) {
    // The print/export pipeline rebuilds the visible rows from data-items, so
    // the stored markup only has to carry the payload.
    return ["table", mergeAttributes({ "data-items-table": "true" }, HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ItemsTableView);
  },
  addCommands() {
    return {
      insertItemsTable:
        () =>
        ({ commands }: { commands: { insertContent: (v: unknown) => boolean } }) =>
          commands.insertContent({ type: this.name, attrs: { data: emptyItemsData() } }),
    } as never;
  },
});

function ItemsTableView({ node, updateAttributes, extension, editor }: NodeViewProps) {
  const opts = extension.options as ItemsTableOptions;
  const ar = opts.lang === "ar";
  const data: ItemsData = mergeItemsData(node.attrs.data);
  const totals = computeItems({ id: "x", kind: "items", startIndex: 0, ...data });
  const editable = editor.isEditable;

  const set = (p: Partial<ItemsData>) => updateAttributes({ data: { ...data, ...p } });
  const setRow = (id: string, p: Partial<ItemRow>) =>
    set({ rows: data.rows.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const addRow = () =>
    set({ rows: [...data.rows, { id: uid(), descAr: "", descEn: "", unitAr: "", unitEn: "", qty: 1, price: 0, discount: 0 }] });
  const delRow = (id: string) => set({ rows: data.rows.filter((r) => r.id !== id) });

  return (
    <NodeViewWrapper>
      <div className="doc-items-node" contentEditable={false}>
        <div className="doc-items-head">
          <input
            className="doc-items-title"
            value={ar ? data.titleAr : data.titleEn}
            disabled={!editable}
            placeholder={ar ? "عنوان الجدول" : "Table title"}
            onChange={(e) => set(ar ? { titleAr: e.target.value } : { titleEn: e.target.value })}
          />
          <div className="doc-items-flags">
            {([
              ["showUnit", ar ? "الوحدة" : "Unit"],
              ["showQty", ar ? "الكمية" : "Qty"],
              ["showPrice", ar ? "السعر" : "Price"],
              ["showTotals", ar ? "المجاميع" : "Totals"],
            ] as [keyof ItemsData, string][]).map(([k, label]) => (
              <label key={String(k)}>
                <input
                  type="checkbox"
                  checked={Boolean(data[k])}
                  disabled={!editable}
                  onChange={(e) => set({ [k]: e.target.checked } as Partial<ItemsData>)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <table className="doc-items-table">
          <thead>
            <tr>
              <th style={{ width: 28 }}>#</th>
              <th>{ar ? "البيان" : "Description"}</th>
              {data.showUnit && <th style={{ width: 80 }}>{ar ? "الوحدة" : "Unit"}</th>}
              {data.showQty && <th style={{ width: 66 }}>{ar ? "الكمية" : "Qty"}</th>}
              {data.showPrice && <th style={{ width: 96 }}>{ar ? "سعر الوحدة" : "Unit price"}</th>}
              <th style={{ width: 96 }}>{ar ? "الإجمالي" : "Total"}</th>
              {editable && <th style={{ width: 34 }} />}
            </tr>
          </thead>
          <tbody>
            {totals.lines.map((l, i) => (
              <tr key={l.row.id}>
                <td>{i + 1}</td>
                <td>
                  <input
                    value={ar ? l.row.descAr : l.row.descEn}
                    disabled={!editable}
                    onChange={(e) => setRow(l.row.id, ar ? { descAr: e.target.value } : { descEn: e.target.value })}
                  />
                </td>
                {data.showUnit && (
                  <td>
                    <input
                      value={ar ? l.row.unitAr : l.row.unitEn}
                      disabled={!editable}
                      onChange={(e) => setRow(l.row.id, ar ? { unitAr: e.target.value } : { unitEn: e.target.value })}
                    />
                  </td>
                )}
                {data.showQty && (
                  <td>
                    <input
                      type="number"
                      value={l.row.qty}
                      disabled={!editable}
                      onChange={(e) => setRow(l.row.id, { qty: Number(e.target.value) || 0 })}
                    />
                  </td>
                )}
                {data.showPrice && (
                  <td>
                    <input
                      type="number"
                      value={l.row.price}
                      disabled={!editable}
                      onChange={(e) => setRow(l.row.id, { price: Number(e.target.value) || 0 })}
                    />
                  </td>
                )}
                <td className="doc-items-num">{money(l.total, "")}</td>
                {editable && (
                  <td>
                    <button type="button" className="doc-items-del" onClick={() => delRow(l.row.id)} title={ar ? "حذف" : "Delete"}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {editable && (
          <div className="doc-items-tools">
            <button type="button" className="btn-ghost" onClick={addRow}>
              <Plus size={13} /> {ar ? "سطر جديد" : "Add row"}
            </button>
            <label>
              {ar ? "الضريبة %" : "Tax %"}
              <input type="number" value={data.taxRate} onChange={(e) => set({ taxRate: Number(e.target.value) || 0 })} />
            </label>
            <label>
              {ar ? "خصم" : "Discount"}
              <input type="number" value={data.discount} onChange={(e) => set({ discount: Number(e.target.value) || 0 })} />
            </label>
            <label>
              {ar ? "شحن" : "Shipping"}
              <input type="number" value={data.shipping} onChange={(e) => set({ shipping: Number(e.target.value) || 0 })} />
            </label>
          </div>
        )}

        {data.showTotals && (
          <div className="doc-items-totals">
            <span>{ar ? "المجموع" : "Subtotal"}: {money(totals.subtotal, opts.currency)}</span>
            {Number(data.taxRate) > 0 && <span>{ar ? "الضريبة" : "Tax"}: {money(totals.tax, opts.currency)}</span>}
            <strong>{ar ? "الإجمالي" : "Total"}: {money(totals.grand, opts.currency)}</strong>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
