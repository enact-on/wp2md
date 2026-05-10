// In-memory migration report. Persisted to JSON + a brief human-readable
// summary at the end of a run.

import fs from 'fs';
import path from 'path';

export function createReport() {
	return {
		startedAt: new Date().toISOString(),
		input: undefined,
		output: undefined,
		postTypes: {},               // type -> count
		taxonomies: [],
		authors: 0,
		posts: { written: 0, skipped: 0, failed: 0 },
		images: { written: 0, skipped: 0, failed: 0 },
		unknownShortcodes: {},       // name -> count
		blocks: {},                  // name -> count
		metaSummary: { frontmatter: 0, complex: 0, skipped: 0 },
		brokenLinks: [],
		warnings: []
	};
}

export function noteBlocks(report, blockNames) {
	for (const name of blockNames) {
		report.blocks[name] = (report.blocks[name] ?? 0) + 1;
	}
}

export function noteMeta(report, perPostReport) {
	report.metaSummary.frontmatter += perPostReport.frontmatter.length;
	report.metaSummary.complex += perPostReport.complex.length;
	report.metaSummary.skipped += perPostReport.skipped.length;
}

export async function writeReport(report, outputDir) {
	report.finishedAt = new Date().toISOString();
	const jsonPath = path.join(outputDir, 'migration-report.json');
	const txtPath = path.join(outputDir, 'migration-report.txt');
	await fs.promises.mkdir(outputDir, { recursive: true });
	await fs.promises.writeFile(jsonPath, JSON.stringify(report, null, 2));
	await fs.promises.writeFile(txtPath, renderText(report));
	return { jsonPath, txtPath };
}

function renderText(r) {
	const lines = [];
	lines.push('WordPress Export to Markdown - Migration Report');
	lines.push('================================================');
	lines.push(`Input:  ${r.input}`);
	lines.push(`Output: ${r.output}`);
	lines.push(`Started:  ${r.startedAt}`);
	lines.push(`Finished: ${r.finishedAt}`);
	lines.push('');
	lines.push('Post types:');
	for (const [k, v] of Object.entries(r.postTypes)) {
		lines.push(`  - ${k}: ${v}`);
	}
	lines.push('');
	lines.push(`Taxonomies: ${r.taxonomies.join(', ') || '(none)'}`);
	lines.push(`Authors: ${r.authors}`);
	lines.push('');
	lines.push(`Posts written: ${r.posts.written}, skipped: ${r.posts.skipped}, failed: ${r.posts.failed}`);
	lines.push(`Images written: ${r.images.written}, skipped: ${r.images.skipped}, failed: ${r.images.failed}`);
	lines.push('');
	lines.push(`Custom fields -> frontmatter: ${r.metaSummary.frontmatter}, complex blocks: ${r.metaSummary.complex}, skipped: ${r.metaSummary.skipped}`);
	lines.push('');
	if (Object.keys(r.unknownShortcodes).length > 0) {
		lines.push('Unknown shortcodes (consider adding a handler):');
		for (const [k, v] of Object.entries(r.unknownShortcodes).sort((a, b) => b[1] - a[1])) {
			lines.push(`  - ${k}: ${v}`);
		}
		lines.push('');
	}
	if (Object.keys(r.blocks).length > 0) {
		lines.push('Gutenberg blocks encountered:');
		for (const [k, v] of Object.entries(r.blocks).sort((a, b) => b[1] - a[1])) {
			lines.push(`  - wp:${k}: ${v}`);
		}
		lines.push('');
	}
	if (r.warnings.length > 0) {
		lines.push('Warnings:');
		for (const w of r.warnings) lines.push(`  - ${w}`);
	}
	return lines.join('\n') + '\n';
}
