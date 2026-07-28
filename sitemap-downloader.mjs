#!/usr/bin/env node
/**
 * sitemap-downloader.mjs
 *
 * Usage:
 *   node scripts/sitemap-downloader.mjs <sitemap-url> [options]
 *
 * Options:
 *   --out <dir>          Output directory (default: ./crawled-pages)
 *   --concurrency <n>    Parallel fetches (default: 3)
 *   --delay <ms>         Delay between batches in ms (default: 400)
 *   --retries <n>        Retry attempts on failure (default: 2)
 *   --only-new           Skip URLs already recorded as "ok" in the CSV report
 *   --exclude <path>     Exclude URLs whose path contains <path> (repeatable)
 */

import Sitemapper from 'sitemapper';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { URL } from 'url';

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (!args.length || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: node scripts/sitemap-downloader.mjs <sitemap-url> [options]

Options:
  --out <dir>          Output directory  (default: ./crawled-pages)
  --concurrency <n>    Parallel fetches  (default: 3)
  --delay <ms>         ms between batches (default: 400)
  --retries <n>        Retry attempts    (default: 2)
  --only-new           Skip URLs already marked "ok" in the CSV report
  --exclude <path>     Exclude URLs whose path contains <path> (repeatable)
                       e.g. --exclude /blog/ --exclude /apps/

Example:
  node scripts/sitemap-downloader.mjs https://example.com/sitemap.xml --out ./pages
  node scripts/sitemap-downloader.mjs https://example.com/sitemap.xml --only-new
`);
  process.exit(0);
}

const sitemapUrl  = args[0];
const outDir      = argVal('--out',         './crawled-pages');
const concurrency = Number(argVal('--concurrency', '3'));
const delay       = Number(argVal('--delay',       '400'));
const retries     = Number(argVal('--retries',     '2'));
const onlyNew     = args.includes('--only-new');

function argVal(flag, fallback) {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}

function argVals(flag) {
  const vals = [];
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) vals.push(args[i + 1]);
  }
  return vals;
}

const excludePaths = argVals('--exclude');

// CSV lives alongside the output folder, named after the host
function csvPath(host) {
  return path.join(outDir, host, 'report.csv');
}

async function loadExistingReport(csvFile) {
  if (!existsSync(csvFile)) return new Map();
  const text = await readFile(csvFile, 'utf8');
  const map = new Map();
  for (const line of text.split('\n').slice(1)) {  // skip header
    const [url, status] = line.split(',');
    if (url) map.set(url.trim(), status?.trim());
  }
  return map;
}

function csvEscape(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatProgress(done, total) {
  const pct = Math.round((done / total) * 100);
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  return `[${bar}] ${pct}% (${done}/${total})`;
}

// ── Realistic browser headers ─────────────────────────────────────────────────

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function buildHeaders(pageUrl) {
  const origin = new URL(pageUrl).origin;
  return {
    'User-Agent':                randomUA(),
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':           'en-US,en;q=0.9',
    'Accept-Encoding':           'gzip, deflate, br',
    'Cache-Control':             'no-cache',
    'Pragma':                    'no-cache',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest':            'document',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-Site':            'none',
    'Sec-Fetch-User':            '?1',
    'Referer':                   origin + '/',
    'DNT':                       '1',
  };
}

// ── URL → file path ────────────────────────────────────────────────────────────
//
//   https://example.com/              → {out}/example.com/index.html
//   https://example.com/about         → {out}/example.com/about.html
//   https://example.com/about/        → {out}/example.com/about/index.html
//   https://example.com/blog/post-1   → {out}/example.com/blog/post-1.html
//   https://example.com/blog/post-1/  → {out}/example.com/blog/post-1/index.html
//   https://example.com/?p=234        → {out}/example.com/index__p=234.html
//   https://example.com/page?id=5     → {out}/example.com/page__id=5.html

function urlToFilePath(rawUrl, baseDir) {
  const u = new URL(rawUrl);
  const host = u.hostname;
  const pathname = u.pathname;

  const endsWithSlash = pathname.endsWith('/');
  const segments = pathname.replace(/^\//, '').split('/').filter(Boolean);

  // Sanitise query string into a safe suffix: ?p=234&x=1 → __p=234__x=1
  const querySuffix = u.search
    ? '__' + u.search.slice(1).replace(/&/g, '__').replace(/[^\w=.-]/g, '_')
    : '';

  let dirs, baseName;
  if (segments.length === 0) {
    dirs = [];
    baseName = 'index';
  } else if (endsWithSlash) {
    dirs = segments;
    baseName = 'index';
  } else {
    dirs = segments.slice(0, -1);
    baseName = segments[segments.length - 1];
  }

  const file = baseName + querySuffix + '.html';
  return path.join(baseDir, host, ...dirs, file);
}

// ── Fetch with retries ────────────────────────────────────────────────────────

async function fetchHtml(pageUrl, attempt = 0) {
  const res = await fetch(pageUrl, {
    headers: buildHeaders(pageUrl),
    redirect: 'follow',
  });

  if (!res.ok) {
    if (attempt < retries && res.status >= 500) {
      await sleep(800 * (attempt + 1));
      return fetchHtml(pageUrl, attempt + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.text();
}

// ── Concurrency helpers ───────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function runInBatches(items, batchSize, fn) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) await sleep(delay);
  }
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSitemap Downloader`);
  console.log(`  Sitemap  : ${sitemapUrl}`);
  console.log(`  Output   : ${path.resolve(outDir)}`);
  console.log(`  Parallel : ${concurrency}  |  Delay: ${delay}ms  |  Retries: ${retries}`);
  if (excludePaths.length) console.log(`  Exclude  : ${excludePaths.join(', ')}`);
  console.log();

  // Fetch all URLs from sitemap (handles sitemap index files automatically)
  const sitemap = new Sitemapper({ url: sitemapUrl, timeout: 15000 });
  let urls = [];
  try {
    const result = await sitemap.fetch();
    urls = result.sites;
  } catch (err) {
    console.error(`Failed to fetch sitemap: ${err.message}`);
    process.exit(1);
  }

  if (!urls.length) {
    console.warn('No URLs found in sitemap.');
    process.exit(0);
  }

  // Deduplicate (sitemap index files can cause the same URL to appear in
  // multiple child sitemaps)
  const unique = [...new Set(urls)];
  if (unique.length < urls.length) {
    console.log(`Deduped ${urls.length} → ${unique.length} unique URLs`);
  }
  urls = unique;

  console.log(`Found ${urls.length} URL${urls.length !== 1 ? 's' : ''}\n`);

  // Apply --exclude filters
  if (excludePaths.length) {
    const before = urls.length;
    urls = urls.filter(u => !excludePaths.some(p => new URL(u).pathname.includes(p)));
    const excluded = before - urls.length;
    if (excluded) console.log(`Excluded ${excluded} URL(s) matching: ${excludePaths.join(', ')}\n`);
  }

  // Derive CSV path from the first URL's hostname
  const host = new URL(urls[0]).hostname;
  const reportFile = csvPath(host);
  await mkdir(path.dirname(reportFile), { recursive: true });

  // Load prior results when --only-new is active
  const prior = onlyNew ? await loadExistingReport(reportFile) : new Map();
  if (onlyNew) {
    const before = urls.length;
    urls = urls.filter(u => prior.get(u) !== 'ok');
    const skippedCount = before - urls.length;
    if (skippedCount) console.log(`Skipping ${skippedCount} already-saved URL(s) (--only-new)\n`);
  }

  if (!urls.length) {
    console.log('Nothing new to fetch.');
    process.exit(0);
  }

  // Merge prior results into rows for final CSV (preserved across runs)
  const rows = new Map(prior);

  let ok = 0;
  let fail = 0;
  let done = 0;
  const total = urls.length;

  // Print initial progress bar
  process.stdout.write(`\r  ${formatProgress(0, total)}`);

  await runInBatches(urls, concurrency, async (url) => {
    const filePath = urlToFilePath(url, outDir);
    let status, note;
    try {
      const html = await fetchHtml(url);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, html, 'utf8');
      status = 'ok';
      note = path.relative(outDir, filePath);
      ok++;
    } catch (err) {
      status = 'error';
      note = err.message;
      fail++;
    }
    rows.set(url, { status, note });
    done++;
    process.stdout.write(`\r  ${formatProgress(done, total)}  `);
  });

  process.stdout.write('\n\n');

  // Write CSV report
  const csvLines = ['url,status,file_or_error'];
  for (const [url, val] of rows) {
    const { status, note } = typeof val === 'object' ? val : { status: val, note: '' };
    csvLines.push(`${csvEscape(url)},${status},${csvEscape(note ?? '')}`);
  }
  await writeFile(reportFile, csvLines.join('\n') + '\n', 'utf8');

  // Print failures inline after progress bar
  for (const [url, val] of rows) {
    if (typeof val === 'object' && val.status === 'error') {
      console.error(`  ✗  ${url}`);
      console.error(`       ${val.note}`);
    }
  }

  console.log(`─────────────────────────────────────`);
  console.log(`  Saved  : ${ok}`);
  if (fail)    console.log(`  Failed : ${fail}`);
  if (onlyNew) console.log(`  Skipped: ${prior.size - [...prior.values()].filter(v => v !== 'ok').length}`);
  console.log(`  Report : ${path.relative('.', reportFile)}`);
  console.log(`  Dir    : ${path.resolve(outDir)}`);
  console.log(`─────────────────────────────────────\n`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
