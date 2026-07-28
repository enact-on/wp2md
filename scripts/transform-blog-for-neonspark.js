#!/usr/bin/env node
// Transforms enacton blog posts (output/enacton/posts/) to neonspark blog format
// and writes them to the target Astro project's src/content/blog/

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTS_DIR = path.resolve(__dirname, '../output/enacton/posts');
const BLOG_DIR = path.resolve(__dirname, '../../neonspark-astro/src/content/blog');

// Ensure blog dir exists
fs.mkdirSync(BLOG_DIR, { recursive: true });

function parseYamlFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1], body: match[2] };
}

function extractField(yaml, key) {
  const re = new RegExp(`^${key}:\\s*(.+)$`, 'm');
  const m = yaml.match(re);
  return m ? m[1].replace(/^['"]|['"]$/g, '').trim() : '';
}

function extractSeoField(yaml, field) {
  // handles nested seo: block
  const seoMatch = yaml.match(/^seo:\s*\n((?:  .+\n?)*)/m);
  if (!seoMatch) return '';
  const seoBlock = seoMatch[1];
  const re = new RegExp(`^  ${field}:\\s*(.+)$`, 'm');
  const m = seoBlock.match(re);
  return m ? m[1].replace(/^['"]|['"]$/g, '').trim() : '';
}

function extractArray(yaml, key) {
  const re = new RegExp(`^${key}:\\s*\\n((?:  - .+\\n?)*)`, 'm');
  const m = yaml.match(re);
  if (!m) return [];
  return m[1].match(/  - (.+)/g)?.map(s => s.replace(/  - /, '').trim()) ?? [];
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function categoryToName(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

let written = 0;
let skipped = 0;

const postDirs = fs.readdirSync(POSTS_DIR).filter(d => {
  const full = path.join(POSTS_DIR, d);
  return fs.statSync(full).isDirectory() && !d.startsWith('_');
});

for (const dir of postDirs) {
  const mdxPath = path.join(POSTS_DIR, dir, 'index.mdx');
  const mdPath = path.join(POSTS_DIR, dir, 'index.md');
  const srcPath = fs.existsSync(mdxPath) ? mdxPath : fs.existsSync(mdPath) ? mdPath : null;
  if (!srcPath) { skipped++; continue; }

  const content = fs.readFileSync(srcPath, 'utf8');
  const { frontmatter: yaml, body } = parseYamlFrontmatter(content);

  const title = extractField(yaml, 'title') || dir;
  const date = extractField(yaml, 'date') || new Date().toISOString().split('T')[0];
  const coverImage = extractField(yaml, 'coverImage');
  const excerpt = extractField(yaml, 'excerpt');
  const seoTitle = extractSeoField(yaml, 'title');
  const seoDesc = extractSeoField(yaml, 'description');
  const categories = extractArray(yaml, 'categories');

  // Build neonspark frontmatter
  const lines = ['---'];
  lines.push(`title: ${JSON.stringify(title)}`);
  if (seoTitle && seoTitle !== title) lines.push(`meta_title: ${JSON.stringify(seoTitle)}`);
  lines.push(`description: ${JSON.stringify(seoDesc || excerpt || title)}`);
  lines.push(`date: ${date}T00:00:00.000Z`);

  if (coverImage && coverImage.startsWith('http')) {
    lines.push(`image: ${JSON.stringify(coverImage)}`);
  } else {
    lines.push(`image: /images/blog/default.jpg`);
  }

  if (categories.length > 0) {
    lines.push('categories:');
    for (const cat of categories) {
      lines.push(`  - ${JSON.stringify(categoryToName(cat))}`);
    }
  }

  lines.push('featured: false');
  lines.push('draft: false');
  lines.push('---');

  const output = lines.join('\n') + '\n' + body;

  // Write as .md (no MDX syntax in enacton posts typically)
  // Use .mdx if body contains JSX/MDX syntax
  const hasMdx = body.includes('<video') || body.includes('export const') || body.includes('{/*');
  const outFile = path.join(BLOG_DIR, `${dir}${hasMdx ? '.mdx' : '.md'}`);

  fs.writeFileSync(outFile, output, 'utf8');
  written++;
}

console.log(`Blog transform complete: ${written} written, ${skipped} skipped`);
console.log(`Output: ${BLOG_DIR}`);
