declare module "mammoth/mammoth.browser.js" {
  type MammothImage = { contentType: string; read: (encoding: string) => Promise<string> };
  type MammothResult = { value: string; messages: Array<{ message?: string; type?: string }> };

  export const images: {
    imgElement(fn: (image: MammothImage) => Promise<{ src: string }>): unknown;
  };
  export function convertToHtml(
    input: { arrayBuffer: ArrayBuffer },
    options?: { styleMap?: string[]; convertImage?: unknown },
  ): Promise<MammothResult>;
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}
