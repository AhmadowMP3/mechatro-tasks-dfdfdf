declare module "pdfjs-dist/build/pdf.mjs" {
  const lib: any;
  export = lib;
}

declare module "pdfjs-dist/build/pdf.worker.mjs?url" {
  const url: string;
  export default url;
}
