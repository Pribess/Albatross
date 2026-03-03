import { minifySync } from "oxc-minify";
import { transformSync } from "oxc-transform";

const sourcePath = "src/main.ts";
const outputPath = "dist/main.js";

const sourceCode = await Bun.file(sourcePath).text();

const transformed = transformSync(sourcePath, sourceCode, {
  lang: "ts",
  sourceType: "script",
  target: "es2020",
});

if (transformed.errors.length > 0) {
  throw new Error(transformed.errors.map((error) => error.message).join("\n"));
}

const minified = minifySync(outputPath, transformed.code, {
  module: false,
  compress: {
    target: "es2020",
  },
  mangle: {
    toplevel: true,
  },
  codegen: {
    removeWhitespace: true,
  },
});

if (minified.errors.length > 0) {
  throw new Error(minified.errors.map((error) => error.message).join("\n"));
}

await Bun.$`mkdir -p dist`;
await Bun.write(outputPath, minified.code.replace(/[\r\n]+/g, ""));
