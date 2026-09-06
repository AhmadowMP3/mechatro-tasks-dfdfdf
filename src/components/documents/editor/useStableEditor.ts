import { useEffect, useRef, useState } from "react";
import { Editor } from "@tiptap/core";

/**
 * Owns an editor for exactly one mounted component lifetime.
 *
 * TipTap's useEditor hook schedules destruction on a timer between React
 * effects. A quick parent rerender can briefly expose that destroyed instance
 * to EditorContent and node views. Creating and destroying the editor here
 * removes that delayed hand-off entirely.
 */
export function useStableEditor(create: () => Editor): Editor | null {
  const createRef = useRef(create);
  createRef.current = create;
  const instanceRef = useRef<Editor | null>(null);
  const mountedEffectsRef = useRef(0);
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    mountedEffectsRef.current += 1;
    const current = instanceRef.current;
    const instance = editorIsReady(current) ? current : createRef.current();
    instanceRef.current = instance;
    setEditor(instance);

    return () => {
      mountedEffectsRef.current -= 1;

      // React tears parent effects down before every nested editor portal has
      // necessarily finished its own cleanup. Destroying synchronously here
      // nulls TipTap's extension manager while those node views can still use
      // it. A microtask runs after the complete React cleanup pass. The mount
      // counter also preserves this instance across StrictMode's test cycle.
      queueMicrotask(() => {
        if (mountedEffectsRef.current !== 0 || instanceRef.current !== instance) return;
        instanceRef.current = null;
        if (!instance.isDestroyed) instance.destroy();
      });
    };
  }, []);

  return editor && !editor.isDestroyed ? editor : null;
}

export function editorIsReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed);
}