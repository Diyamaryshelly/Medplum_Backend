// Type stubs for the optional peer dependency 'pdfmake'.
// pdfmake has no @types package; this prevents TS7016 / TS2307 errors
// when test files (e.g. client.test.ts) import from it during `tsc`.
declare module 'pdfmake' {
  const PdfPrinter: any;
  export = PdfPrinter;
}

declare module 'pdfmake/interfaces' {
  export type TDocumentDefinitions = any;
  export type TFontDictionary = any;
  export type BufferOptions = any;
  export type CustomTableLayout = any;
  export type DynamicLayout = any;
  export type StyleDictionary = any;
  export type PageSize = any;
  export type PageOrientation = any;
  export type Margins = any;
  export type Content = any;
  export type ContentText = any;
  export type ContentColumns = any;
  export type ContentStack = any;
  export type ContentUnorderedList = any;
  export type ContentOrderedList = any;
  export type ContentTable = any;
  export type ContentImage = any;
  export type ContentSvg = any;
  export type ContentQr = any;
  export type ContentLine = any;
  export type ContentEllipse = any;
  export type ContentRect = any;
  export type ContentAnchor = any;
  export type ContentPageReference = any;
  export type ContentTextReference = any;
  export type ContentToc = any;
  export type TableCell = any;
}
