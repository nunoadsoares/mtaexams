declare module "pdf-parse-debugging-disabled" {
  export default function parsePdf(dataBuffer: Buffer): Promise<{ text: string }>;
}
