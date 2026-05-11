#!/usr/bin/env node
// Config-driven e2e test: runs the tool using test/fixtures/wetm.config.js
// and compares every output file against golden files in test/output-config/.

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT    = path.resolve(__dirname, '..');
const GOLDEN  = path.join(__dirname, 'output-config');
const TMP     = path.join(__dirname, '.tmp-config');

const TOOL_ARGS = [
	'app.js',
	'--config', 'test/fixtures/wetm.config.js',
	'--write-delay', '0',
];

// ─── helpers ──────────────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const GRAY  = '\x1b[90m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function pass(label) { console.log(`  ${GREEN}✓${RESET} ${label}`); passed++; }
function fail(label, detail) {
	console.log(`  ${RED}✗${RESET} ${label}`);
	if (detail) console.log(`    ${GRAY}${detail}${RESET}`);
	failed++;
}

function normalize(s) { return s.replace(/\r\n/g, '\n').trimEnd(); }

function checkText(label, golden, actual) {
	const g = normalize(golden);
	const a = normalize(actual);
	if (g === a) { pass(label); return; }
	const gLines = g.split('\n');
	const aLines = a.split('\n');
	let detail = 'content differs';
	for (let i = 0; i < Math.max(gLines.length, aLines.length); i++) {
		if (gLines[i] !== aLines[i]) {
			detail = `line ${i + 1}: expected ${JSON.stringify(gLines[i])}, got ${JSON.stringify(aLines[i])}`;
			break;
		}
	}
	fail(label, detail);
}

function checkJson(label, golden, actual) {
	try {
		const g = JSON.stringify(JSON.parse(golden), null, 2);
		const a = JSON.stringify(JSON.parse(actual), null, 2);
		if (g === a) pass(label);
		else fail(label, 'JSON content differs');
	} catch (ex) {
		fail(label, 'invalid JSON: ' + ex.message);
	}
}

function checkReport(label, golden, actual) {
	try {
		const g = JSON.parse(golden);
		const a = JSON.parse(actual);
		for (const o of [g, a]) { delete o.startedAt; delete o.finishedAt; delete o.output; }
		const gs = JSON.stringify(g, null, 2);
		const as = JSON.stringify(a, null, 2);
		if (gs === as) {
			pass(label + ' (timestamps/output excluded)');
		} else {
			const gLines = gs.split('\n'); const aLines = as.split('\n');
			let detail = 'differs';
			for (let i = 0; i < Math.max(gLines.length, aLines.length); i++) {
				if (gLines[i] !== aLines[i]) {
					detail = `JSON line ${i + 1}: expected ${JSON.stringify(gLines[i])}, got ${JSON.stringify(aLines[i])}`;
					break;
				}
			}
			fail(label + ' (timestamps/output excluded)', detail);
		}
	} catch (ex) { fail(label, 'invalid JSON: ' + ex.message); }
}

function checkReportTxt(label, golden, actual) {
	const SKIP = /^(Started:|Finished:|Output:)/;
	const filter = (s) => normalize(s).split('\n').filter((l) => !SKIP.test(l.trim())).join('\n');
	if (filter(golden) === filter(actual)) pass(label + ' (timestamps/output excluded)');
	else fail(label + ' (timestamps/output excluded)', 'text content differs');
}

function checkRedirects(label, golden, actual) {
	const sort = (s) => normalize(s).split('\n').filter(Boolean).sort();
	const g = sort(golden); const a = sort(actual);
	if (JSON.stringify(g) === JSON.stringify(a)) {
		pass(label + ' (sorted)');
	} else {
		const missing = g.filter((l) => !a.includes(l));
		const extra   = a.filter((l) => !g.includes(l));
		const parts = [];
		if (missing.length) parts.push('missing: ' + missing.join(', '));
		if (extra.length)   parts.push('extra: '   + extra.join(', '));
		fail(label + ' (sorted)', parts.join(' | '));
	}
}

function walk(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const full = path.join(dir, e.name);
		if (e.isDirectory()) walk(full);
		else check(full);
	}
}

function check(goldenPath) {
	const rel        = path.relative(GOLDEN, goldenPath);
	const label      = rel.replace(/\\/g, '/');
	const actualPath = path.join(TMP, rel);

	if (!fs.existsSync(actualPath)) { fail(label, 'file missing in actual output'); return; }

	const golden = fs.readFileSync(goldenPath, 'utf8');
	const actual = fs.readFileSync(actualPath, 'utf8');
	const base   = path.basename(goldenPath);
	const ext    = path.extname(base).toLowerCase();

	if (base === 'migration-report.json') checkReport(label, golden, actual);
	else if (base === 'migration-report.txt') checkReportTxt(label, golden, actual);
	else if (base === '_redirects')          checkRedirects(label, golden, actual);
	else if (ext === '.json')               checkJson(label, golden, actual);
	else                                     checkText(label, golden, actual);
}

// ─── main ─────────────────────────────────────────────────────────────────────

fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

console.log(`${GRAY}Running tool (config-driven)...${RESET}`);
try {
	execFileSync('node', TOOL_ARGS, { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
} catch (ex) {
	const stderr = ex.stderr ?? '';
	const stdout = ex.stdout ?? '';
	console.error(`${RED}Tool exited with an error:${RESET}`);
	if (stderr) console.error(stderr);
	if (stdout) console.error(stdout);
	console.error(ex.message);
	fs.rmSync(TMP, { recursive: true, force: true });
	process.exit(1);
}

console.log(`${GRAY}Comparing output against golden files...\n${RESET}`);
walk(GOLDEN);

fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n${passed + failed} checks: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : ''}${failed} failed${failed > 0 ? RESET : ''}`);
if (failed > 0) process.exit(1);
