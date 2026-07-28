#!/usr/bin/env node
/**
 * html-to-markdown.mjs
 *
 * Reads every HTML file recorded in a sitemap-downloader report.csv,
 * converts it to Markdown using Turndown, and writes a .md file next
 * to the original HTML.  The CSV is updated in-place with a new
 * `md_file` column.
 *
 * Usage:
 *   node html-to-markdown.mjs [crawled-dir] [options]
 *
 * Options:
 *   --dir <path>         Crawled pages root  (default: ./crawled-pages)
 *   --host <hostname>    Limit to one host sub-folder  (e.g. www.example.com)
 *   --selector <css>     CSS selector for main content (default: auto-detect)
 *   --concurrency <n>    Parallel conversions  (default: 5)
 *   --only-new           Skip rows that already have an md_file in the CSV
 */

import TurndownService      from 'turndown';
import { gfm }              from 'turndown-plugin-gfm';
import { parse as parseHtml } from 'node-html-parser';
import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { existsSync }       from 'fs';
import path                 from 'path';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node html-to-markdown.mjs [options]

Options:
  --dir <path>         Crawled pages root   (default: ./crawled-pages)
  --host <hostname>    Limit to one host    (e.g. www.example.com)
  --selector <css>     Main-content CSS selector (default: auto-detect)
  --concurrency <n>    Parallel conversions (default: 5)
  --only-new           Skip rows that already have an md_file entry

Example:
  node html-to-markdown.mjs --dir ./crawled-pages
  node html-to-markdown.mjs --host www.example.com --only-new
  node html-to-markdown.mjs --selector "article.post-content"
`);
  process.exit(0);
}

function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

const crawledDir  = argVal('--dir',         './crawled-pages');
const hostFilter  = argVal('--host',        null);
const userSelector = argVal('--selector',  null);
const concurrency = Number(argVal('--concurrency', '5'));
const onlyNew     = args.includes('--only-new');

// ── Turndown setup ────────────────────────────────────────────────────────────

function makeTurndown() {
  const td = new TurndownService({
    headingStyle:    'atx',
    codeBlockStyle:  'fenced',
    bulletListMarker: '-',
    hr: '---',
  });

  td.use(gfm);

  // Strip non-content elements
  td.remove([
    'script', 'style', 'noscript', 'iframe',
    'nav', 'header', 'footer', 'aside',
    'form', 'button', 'svg', 'canvas',
    '.wp-block-navigation', '.site-header', '.site-footer',
    '.navigation', '.breadcrumb', '.breadcrumbs',
    '.related-posts', '.post-navigation', '.page-navigation',
    '.comments', '.comment-respond', '#comments',
    '.social-share', '.share-buttons',
    '.cookie-notice', '.popup', '.modal',
    '.advertisement', '.ad', '[class*="widget"]',
  ]);

  return td;
}

// ── Content extraction ────────────────────────────────────────────────────────

// Ordered list of selectors tried when no --selector is given.
// First match wins.
const CONTENT_SELECTORS = [
  'article.post',
  'article.hentry',
  'article',
  'main .entry-content',
  'main .post-content',
  'main .page-content',
  '.entry-content',
  '.post-content',
  '.page-content',
  '.article-content',
  '[class*="entry-content"]',
  'main',
  '[role="main"]',
  '#content',
  '#main',
];

function extractContent(html) {
  const root = parseHtml(html, { comment: false });

  // Remove noise nodes before extraction so they don't pollute the result
  for (const sel of [
    'script', 'style', 'noscript', 'iframe', 'svg',
    'nav', 'header', 'footer', 'aside',
    '#wpadminbar', '.wpadminbar',
  ]) {
    root.querySelectorAll(sel).forEach(n => n.remove());
  }

  if (userSelector) {
    const el = root.querySelector(userSelector);
    return el ? el.innerHTML : root.querySelector('body')?.innerHTML ?? html;
  }

  for (const sel of CONTENT_SELECTORS) {
    const el = root.querySelector(sel);
    if (el && el.innerHTML.trim().length > 200) {
      return el.innerHTML;
    }
  }

  // Final fallback: full body
  return root.querySelector('body')?.innerHTML ?? html;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(str) {
  const s = String(str ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function parseCsvLine(line) {
  // Simple CSV parser that handles quoted fields
  const fields = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(field); field = ''; }
      else field += ch;
    }
  }
  fields.push(field);
  return fields;
}

async function parseCsv(csvPath) {
  const text = await readFile(csvPath, 'utf8');
  const lines = text.split('\n').filter(l => l.trim());
  const [header, ...rows] = lines;
  const cols = header.split(',');
  return {
    cols,
    rows: rows.map(l => {
      const fields = parseCsvLine(l);
      const obj = {};
      cols.forEach((c, i) => { obj[c.trim()] = (fields[i] ?? '').trim(); });
      return obj;
    }),
  };
}

// ── Progress ──────────────────────────────────────────────────────────────────

function formatProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `[${bar}] ${pct}% (${done}/${total})`;
}

// ── Concurrency ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ── Find report CSVs ──────────────────────────────────────────────────────────

async function findReportCsvs(rootDir) {
  const csvFiles = [];
  let entries;
  try {
    entries = await readdir(rootDir);
  } catch {
    console.error(`Cannot read directory: ${rootDir}`);
    process.exit(1);
  }

  for (const entry of entries) {
    if (hostFilter && entry !== hostFilter) continue;
    const hostPath = path.join(rootDir, entry);
    const s = await stat(hostPath).catch(() => null);
    if (!s?.isDirectory()) continue;
    const csv = path.join(hostPath, 'report.csv');
    if (existsSync(csv)) csvFiles.push({ host: entry, csv });
  }
  return csvFiles;
}

// ── Per-host processing ───────────────────────────────────────────────────────

async function processHost({ host, csv }) {
  console.log(`\nHost: ${host}`);
  const td = makeTurndown();

  const { cols, rows } = await parseCsv(csv);

  const hasMdCol = cols.includes('md_file');

  // Rows eligible for conversion
  const targets = rows.filter(r => {
    if (r.status !== 'ok') return false;
    if (!r.file_or_error) return false;
    if (onlyNew && hasMdCol && r.md_file) return false;
    return true;
  });

  if (!targets.length) {
    console.log('  Nothing to convert (all done or no ok rows).');
    return;
  }

  console.log(`  Converting ${targets.length} file(s)…`);

  let done = 0;
  const total = targets.length;
  let ok = 0;
  let fail = 0;
  const failures = [];

  // Build a lookup so we can update rows in-place
  const rowMap = new Map(rows.map(r => [r.url, r]));

  process.stdout.write(`  ${formatProgress(0, total)}`);

  await runInBatches(targets, concurrency, async (row) => {
    const htmlPath = path.join(crawledDir, row.file_or_error.replace(/\\/g, path.sep));
    const mdPath   = htmlPath.replace(/\.html$/, '.md');
    const mdRel    = row.file_or_error.replace(/\.html$/, '.md');

    try {
      const html    = await readFile(htmlPath, 'utf8');
      const content = extractContent(html);
      const md      = td.turndown(content);
      await writeFile(mdPath, md, 'utf8');
      rowMap.get(row.url).md_file = mdRel;
      ok++;
    } catch (err) {
      rowMap.get(row.url).md_file = `ERROR: ${err.message}`;
      failures.push({ url: row.url, err: err.message });
      fail++;
    }

    done++;
    process.stdout.write(`\r  ${formatProgress(done, total)}  `);
  });

  process.stdout.write('\n');

  // Write updated CSV
  const newCols = hasMdCol ? cols : [...cols, 'md_file'];
  const csvLines = [newCols.join(',')];
  for (const row of rows) {
    csvLines.push(newCols.map(c => csvEscape(row[c] ?? '')).join(','));
  }
  await writeFile(csv, csvLines.join('\n') + '\n', 'utf8');

  if (failures.length) {
    console.log('');
    for (const { url, err } of failures) {
      console.error(`  ✗  ${url}`);
      console.error(`       ${err}`);
    }
  }

  console.log(`  Converted : ${ok}`);
  if (fail) console.log(`  Failed    : ${fail}`);
  console.log(`  CSV       : ${path.relative('.', csv)}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const resolvedDir = path.resolve(crawledDir);
  console.log(`\nHTML → Markdown Converter`);
  console.log(`  Source : ${resolvedDir}`);
  if (hostFilter)   console.log(`  Host   : ${hostFilter}`);
  if (userSelector) console.log(`  Selector: ${userSelector}`);
  console.log(`  Parallel: ${concurrency}`);
  if (onlyNew)      console.log(`  Mode   : --only-new (skip existing)`);

  const reports = await findReportCsvs(resolvedDir);

  if (!reports.length) {
    console.error('\nNo report.csv files found. Run sitemap-downloader first.');
    process.exit(1);
  }

  for (const report of reports) {
    await processHost(report);
  }

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
