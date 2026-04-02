import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bannedPatterns = [
  { label: "font-bold", regex: /\bfont-bold\b/g },
  { label: "font-semibold", regex: /\bfont-semibold\b/g },
  { label: "font-medium", regex: /\bfont-medium\b/g },
  { label: "<strong>", regex: /<strong\b/gi },
  { label: "<b>", regex: /<b\b/gi },
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(scriptDir, "../src");
const offenders = [];

function walk(dirPath) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!stats.isFile() || !/\.(js|jsx)$/.test(fullPath)) {
      continue;
    }

    const source = readFileSync(fullPath, "utf8");
    const lines = source.split(/\r?\n/);
    const matches = [];

    lines.forEach((line, index) => {
      bannedPatterns.forEach((pattern) => {
        const found = [...line.matchAll(pattern.regex)];
        if (found.length === 0) return;

        matches.push(
          ...found.map(() => ({
            line: index + 1,
            token: pattern.label,
            source: line.trim(),
          }))
        );
      });
    });

    if (matches.length > 0) {
      offenders.push({
        file: path.relative(path.resolve(scriptDir, ".."), fullPath).replaceAll("\\", "/"),
        matches,
      });
    }
  }
}

walk(srcDir);

if (offenders.length > 0) {
  console.error("Typography audit failed. Remove local font-weight emphasis and inline bold tags:");
  offenders.forEach((offender) => {
    console.error(`\n${offender.file}`);
    offender.matches.forEach((match) => {
      console.error(`  L${match.line}: ${match.token} -> ${match.source}`);
    });
  });
  process.exit(1);
}

console.log("Typography audit passed.");
