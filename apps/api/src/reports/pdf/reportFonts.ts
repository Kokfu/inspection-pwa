import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let cached: string | undefined;

export function reportFontFaceCss(): string {
  if (cached !== undefined) return cached;
  const rules = ([ [400, "normal"], [600, "normal"], [700, "normal"], [400, "italic"] ] as const).map(([weight, style]) => {
    const bytes = readFileSync(require.resolve(`@fontsource/noto-sans/files/noto-sans-latin-${weight}-${style}.woff2`));
    return `@font-face{font-family:"Noto Sans";font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${bytes.toString("base64")}) format("woff2");}`;
  });
  const fallback = readFileSync(new URL("../assets/DejaVuSans.ttf", import.meta.url));
  rules.push(`@font-face{font-family:"DejaVu Sans";font-weight:400; font-style:normal;src:url(data:font/ttf;base64,${fallback.toString("base64")}) format("truetype");}`);
  cached = rules.join("\n");
  return cached;
}
