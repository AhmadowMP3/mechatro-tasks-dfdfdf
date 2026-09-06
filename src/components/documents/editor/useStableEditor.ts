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
  const [editor, setEditor] = useState<Editor | null>(null);

  useEffect(() => {
    const instance = createRef.current();
    setEditor(instance);

    return () => {
      // EditorContent checks isDestroyed while it unmounts, so destroy first
      // and never leave asynchronous destruction queued behind React.
      if (!instance.isDestroyed) instance.destroy();
    };
  }, []);

  return editor && !editor.isDestroyed ? editor : null;
}

export function editorIsReady(editor: Editor | null | undefined): editor is Editor {
  return Boolean(editor && !editor.isDestroyed && editor.extensionManager);
}