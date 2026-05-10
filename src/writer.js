import axios from 'axios';
import chalk from 'chalk';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import * as shared from './shared.js';
import * as yamlEmit from './yaml.js';
import { buildExportBlock } from './mdx.js';

export async function writeFilesPromise(posts, extras = {}) {
	const writtenPath = await writeMarkdownFilesPromise(posts, extras.report);
	if (extras.taxonomies) {
		await writeJsonFile(path.join(shared.config.output, 'data', 'taxonomies.json'), extras.taxonomies);
	}
	if (extras.authors) {
		await writeJsonFile(path.join(shared.config.output, 'data', 'authors.json'), extras.authors);
	}
	if (extras.redirects && extras.redirects.length > 0) {
		await writeRedirects(path.join(shared.config.output, '_redirects'), extras.redirects);
	}
	await writeImageFilesPromise(posts, extras.report);
	return writtenPath;
}

async function processPayloadsPromise(payloads, loadFunc, report, kind) {
	const promises = payloads.map((payload) => new Promise((resolve, reject) => {
		setTimeout(async () => {
			try {
				const data = await loadFunc(payload.item);
				await writeFile(payload.destinationPath, data);
				logPayloadResult(payload);
				if (report) report[kind].written++;
				resolve();
			} catch (ex) {
				logPayloadResult(payload, ex.message);
				if (report) report[kind].failed++;
				resolve(); // do not reject so other payloads continue
			}
		}, payload.delay);
	}));

	await Promise.allSettled(promises);
}

async function writeFile(destinationPath, data) {
	await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.promises.writeFile(destinationPath, data);
}

async function writeJsonFile(destinationPath, data) {
	await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.promises.writeFile(destinationPath, JSON.stringify(data, null, 2));
	console.log(chalk.gray(`Wrote ${path.relative(shared.config.output, destinationPath)}`));
}

async function writeRedirects(destinationPath, redirects) {
	const lines = redirects.map((r) => `${r.from} ${r.to} 301`);
	await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
	await fs.promises.writeFile(destinationPath, lines.join('\n') + '\n');
	console.log(chalk.gray(`Wrote ${path.relative(shared.config.output, destinationPath)} (${redirects.length} redirects)`));
}

async function writeMarkdownFilesPromise(posts, report) {
	let existingCount = 0;
	let delay = 0;
	const payloads = posts.flatMap((post) => {
		const destinationPath = shared.buildPostPath(post);
		if (checkFile(destinationPath)) {
			existingCount++;
			if (report) report.posts.skipped++;
			return [];
		}
		const payload = {
			item: post,
			type: post.type,
			name: shared.getSlugWithFallback(post),
			destinationPath,
			delay
		};
		delay += shared.config.writeDelay;
		return [payload];
	});

	logSavingMessage('posts', existingCount, payloads.length);
	if (payloads.length > 0) {
		await processPayloadsPromise(payloads, loadMarkdownFilePromise, report, 'posts');
	}
}

async function loadMarkdownFilePromise(post) {
	const yamlBody = yamlEmit.stringify(post.frontmatter);
	const exportsBlock = buildExportBlock(post.exports);

	let output = '';
	if (yamlBody.length > 0) {
		output += '---\n' + yamlBody + '---\n\n';
	}
	output += exportsBlock;
	output += post.content + '\n';
	return output;
}

async function writeImageFilesPromise(posts, report) {
	let existingCount = 0;
	let delay = 0;
	const payloads = posts.flatMap((post) => {
		const postPath = shared.buildPostPath(post);
		const imagesDir = path.join(path.dirname(postPath), 'images');
		return post.imageUrls.flatMap((imageUrl) => {
			const filename = shared.getFilenameFromUrl(imageUrl);
			const destinationPath = path.join(imagesDir, filename);
			if (checkFile(destinationPath)) {
				existingCount++;
				if (report) report.images.skipped++;
				return [];
			}
			const payload = {
				item: imageUrl,
				type: 'image',
				name: filename,
				destinationPath,
				delay
			};
			delay += shared.config.requestDelay;
			return [payload];
		});
	});

	logSavingMessage('images', existingCount, payloads.length);
	if (payloads.length > 0) {
		await processPayloadsPromise(payloads, loadImageFilePromise, report, 'images');
	}
}

async function loadImageFilePromise(imageUrl) {
	const url = (/%[\da-f]{2}/i).test(imageUrl) ? imageUrl : encodeURI(imageUrl);

	const requestConfig = {
		method: 'get',
		url,
		headers: { 'User-Agent': 'wordpress-export-to-markdown' },
		responseType: 'arraybuffer',
		timeout: 30000,
		maxRedirects: 5
	};

	if (!shared.config.strictSsl) {
		requestConfig.httpAgent = new http.Agent({ rejectUnauthorized: false });
		requestConfig.httpsAgent = new https.Agent({ rejectUnauthorized: false });
	}

	let lastError;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await axios(requestConfig);
			return Buffer.from(response.data, 'binary');
		} catch (ex) {
			lastError = ex;
			if (attempt < 3) {
				await new Promise((r) => setTimeout(r, 500 * attempt));
			}
		}
	}
	throw lastError;
}

function checkFile(p) {
	return fs.existsSync(p);
}

function logSavingMessage(things, existingCount, remainingCount) {
	shared.logHeading(`Saving ${things}`);
	if (existingCount + remainingCount === 0) {
		console.log(`No ${things} to save.`);
	} else if (existingCount === 0) {
		console.log(`${remainingCount} ${things} to save.`);
	} else if (remainingCount === 0) {
		console.log(`All ${existingCount} ${things} already saved.`);
	} else {
		console.log(`${existingCount} ${things} already saved, ${remainingCount} remaining.`);
	}
}

function logPayloadResult(payload, errorMessage) {
	const messageBits = [
		errorMessage ? chalk.red('✗') : chalk.green('✓'),
		chalk.gray(`[${payload.type}]`),
		payload.name
	];
	if (errorMessage) {
		messageBits.push(chalk.red(`(${errorMessage})`));
	}
	console.log(messageBits.join(' '));
}
