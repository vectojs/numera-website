import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ENTRY_BUDGET_BYTES = 350 * 1024;
const html = await readFile("dist/index.html", "utf8");
const entryPath = html.match(/<script[^>]+src="([^"]+\.js)"/u)?.[1];

if (!entryPath)
  throw new Error("Unable to locate the Vite entry script in dist/index.html.");

const entryFile = join("dist", entryPath.replace(/^\//u, ""));
const [source, metadata] = await Promise.all([
  readFile(entryFile, "utf8"),
  stat(entryFile),
]);
const forbidden = ["mathjax", "marked"].filter((dependency) =>
  source.toLowerCase().includes(dependency),
);

if (forbidden.length > 0)
  throw new Error(
    `Entry bundle includes rich-content dependencies: ${forbidden.join(", ")}.`,
  );
if (metadata.size > ENTRY_BUDGET_BYTES)
  throw new Error(
    `Entry bundle is ${metadata.size} bytes; the budget is ${ENTRY_BUDGET_BYTES} bytes.`,
  );

console.log(`Verified Numera entry bundle (${metadata.size} bytes).`);
