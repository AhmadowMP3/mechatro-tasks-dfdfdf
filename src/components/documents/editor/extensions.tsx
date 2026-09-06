// Custom TipTap nodes for the Word-style document editor:
//   • PageBreak  — a real manual page break honoured by the paginator
//   • DocField   — inline auto field (number / date / totals …)
//   • ItemsTable — the smart items table with automatic totals

import { createContext, useContext } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Plus, Trash2 } from "lucide-react";
import { RiyalSymbol } from "@/lib/currency";
import { computeItems, money, uid, type ItemRow } from "@/lib/docs/model";
import { DOC_FIELDS, fieldLabel, mergeItemsData, readItemsAttr, writeItemsAttr, emptyItemsData, type ItemsData } from "@/lib/docs/rich";
import type { DocLang } from "@/lib/docs/types";

/* ── Live editor context ──────────────────────────────────────────
 * Node views read the current language / currency from React context so a
 * language switch never has to tear the editor down and rebuild it (that
 * teardown was the source of the "reading 'extensions'" crash). The
 * extension options stay in sync for HTML serialisation only.            */

export type DocEditorCtxValue = { lang: DocLang; currency: string };

const DocEditorCtx = createContext<DocEditorCtxValue | null>(null);

export const DocEditorCtxProvider = DocEditorCtx.Provider;

function useDocCtx(fallback: DocEditorCtxValue): DocEditorCtxValue {
  return useContext(DocEditorCtx) ?? fallback;
}


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

export type DocFieldOptions = {
  lang: DocLang;
  values: Record<string, string>;
  getLang?: () => DocLang;
  getValues?: () => Record<string, string>;
};

export const DocField = Node.create<DocFieldOptions>({
  name: "docField",
  group: "inline",
  inline: true,
  atom: true,
  addOptions() {
    return { lang: "ar", values: {}, getLang: undefined, getValues: undefined };
  },
  addAttributes() {
    return { field: { default: "number" } };
  },
  parseHTML() {
    return [{ tag: "span[data-doc-field]", getAttrs: (el) => ({ field: (el as HTMLElement).getAttribute("data-doc-field") ?? "number" }) }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const lang = this.options.getLang?.() ?? this.options.lang;
    const values = this.options.getValues?.() ?? this.options.values;
    return [
      "span",
      mergeAttributes({ "data-doc-field": node.attrs.field as string }, HTMLAttributes),
      String(values[node.attrs.field as string] ?? fieldLabel(node.attrs.field as string, lang)),
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DocFieldView);
  },
});

function DocFieldView({ node, extension }: NodeViewProps) {
  const opts = extension.options as DocFieldOptions;
  const { lang } = useDocCtx({ lang: opts.getLang?.() ?? opts.lang, currency: "" });
  const key = node.attrs.field as string;
  const value = (opts.getValues?.() ?? opts.values)[key];
  return (
    <NodeViewWrapper as="span">
      <span className="doc-field-chip" contentEditable={false} title={fieldLabel(key, lang)}>
        {value || fieldLabel(key, lang)}
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
  const ctx = useDocCtx({ lang: opts.lang, currency: opts.currency });
  const ar = ctx.lang === "ar";
  const data: ItemsData = mergeItemsData(node.attrs.data);
  const totals = computeItems(data);
  const editable = Boolean(!editor.isDestroyed && editor.extensionManager && editor.isEditable);

  const set = (p: Partial<ItemsData>) => {
    if (editor.isDestroyed || !editor.extensionManager) return;
    updateAttributes({ data: { ...data, ...p } });
  };
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
            <span>{ar ? "المجموع" : "Subtotal"}: <DocMoney value={totals.subtotal} currency={ctx.currency} /></span>
            {Number(data.taxRate) > 0 && <span>{ar ? "الضريبة" : "Tax"}: <DocMoney value={totals.tax} currency={ctx.currency} /></span>}
            <strong>{ar ? "الإجمالي" : "Total"}: <DocMoney value={totals.grand} currency={ctx.currency} /></strong>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

/** Amount + currency inside the editor preview — the Saudi Riyal shows its
 *  official glyph, matching the printed sheet exactly. */
function DocMoney({ value, currency }: { value: number; currency: string }) {
  const num = money(value, "");
  if (currency !== "SAR") return <>{money(value, currency)}</>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, direction: "ltr" }}>
      {num}
      <RiyalSymbol size="0.95em" />
    </span>
  );
}
