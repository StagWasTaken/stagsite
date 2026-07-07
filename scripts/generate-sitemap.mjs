#!/usr/bin/env node
/**
 * Automatic sitemap generator for stagsite.
 *
 * Scans the repository root for .html pages, figures out each page's
 * last-modified date from git history (falling back to filesystem mtime),
 * and writes/updates sitemap.xml.
 *
 * Run manually with:  node scripts/generate-sitemap.mjs
 * Or let the GitHub Action in .github/workflows/sitemap.yml run it on push.
 */

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join, extname } from "node:path";

// ---- Configuration --------------------------------------------------

const SITE_URL = "https://stagwastaken.github.io/stagsite"; // no trailing slash
const ROOT_DIR = process.cwd();
const OUTPUT_FILE = join(ROOT_DIR, "sitemap.xml");

// Files that should never show up in the sitemap.
const EXCLUDE_PATTERNS = [
  /^not_found\.html$/i, // custom 404 page
  /^google[a-z0-9]*\.html$/i, // Google Search Console verification file
];

// Give the homepage top priority; everything else is a normal page.
const PRIORITY = {
  "index.html": "1.0",
};
const DEFAULT_PRIORITY = "0.7";

// ---- Helpers ----------------------------------------------------------

function isExcluded(filename) {
  return EXCLUDE_PATTERNS.some((pattern) => pattern.test(filename));
}

function getLastModified(filepath, filename) {
  // Prefer the last git commit date that touched this file, since that's
  // a much more meaningful "last modified" than a checkout's mtime.
  try {
    const gitDate = execSync(`git log -1 --format=%cI -- "${filename}"`, {
      cwd: ROOT_DIR,
      stdio: ["pipe", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (gitDate) return gitDate.slice(0, 10); // YYYY-MM-DD
  } catch {
    // Not a git repo, or git isn't available — fall through to mtime.
  }
  return statSync(filepath).mtime.toISOString().slice(0, 10);
}

function urlFor(filename) {
  if (filename.toLowerCase() === "index.html") return `${SITE_URL}/`;
  return `${SITE_URL}/${filename}`;
}

// ---- Main ---------------------------------------------------------------

function main() {
  const htmlFiles = readdirSync(ROOT_DIR)
    .filter((f) => extname(f).toLowerCase() === ".html")
    .filter((f) => !isExcluded(f))
    .sort((a, b) => {
      // index.html always first, then alphabetical
      if (a.toLowerCase() === "index.html") return -1;
      if (b.toLowerCase() === "index.html") return 1;
      return a.localeCompare(b);
    });

  if (htmlFiles.length === 0) {
    console.error("No HTML pages found — nothing to write.");
    process.exit(1);
  }

  const urlEntries = htmlFiles.map((filename) => {
    const filepath = join(ROOT_DIR, filename);
    const loc = urlFor(filename);
    const lastmod = getLastModified(filepath, filename);
    const priority = PRIORITY[filename.toLowerCase()] ?? DEFAULT_PRIORITY;

    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join("\n")}
</urlset>
`;

  writeFileSync(OUTPUT_FILE, xml);
  console.log(`Wrote sitemap.xml with ${htmlFiles.length} page(s):`);
  htmlFiles.forEach((f) => console.log(`  - ${urlFor(f)}`));
}

main();
