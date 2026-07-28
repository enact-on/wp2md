#!/usr/bin/env python3
"""
Fix blog post files in neonspark-astro:
1. Replace internal /posts/ links with /blog/
2. Replace internal /pages/mvp-... etc with correct paths
3. Extract first image from content to use as featured image when default is set
"""

import re, pathlib

BLOG_DIR = pathlib.Path(r"D:\AI Coditor\neonspark-astro\src\content\blog")

# Image URL pattern in markdown
IMG_PATTERN = re.compile(r'!\[[^\]]*\]\((https://[^\)]+)\)')
# First line after frontmatter that's an image

fixed_links = 0
fixed_images = 0
total = 0

for f in BLOG_DIR.glob("*.md"):
    if f.name == "-index.md":
        continue

    with open(f, encoding="utf-8", errors="replace") as fh:
        content = fh.read()

    original = content

    # 1. Fix /posts/ → /blog/ internal links (only enacton.com relative links)
    content = re.sub(r'\(/posts/', r'(/blog/', content)
    content = content.replace(r'"(/posts/', r'"(/blog/')
    # Fix enacton.com/posts/ → absolute links with /blog/
    content = re.sub(
        r'https?://(?:www\.)?enacton\.com/posts/([^)\s"]+)',
        r'/blog/\1',
        content
    )
    # Fix enactsoft.com/pages/... relative to /
    content = re.sub(
        r'https?://(?:www\.)?enactsoft\.com/pages/',
        r'/',
        content
    )
    # Remove trailing slash from enacton internal links
    content = re.sub(
        r'https?://(?:www\.)?enacton\.com/(?!wp-content)',
        r'/',
        content
    )

    # 2. Extract first image for frontmatter if still using default
    if '/images/blog/default.jpg' in content:
        # find first image URL in the body (after frontmatter)
        fm_end = content.find('\n---\n', 4)
        if fm_end == -1:
            fm_end = content.find('\n---', 4)
        body = content[fm_end+4:] if fm_end > 0 else content

        img_match = IMG_PATTERN.search(body)
        if img_match:
            img_url = img_match.group(1)
            # Use absolute URL from WordPress (user will update to R2 later)
            content = content.replace(
                'image: /images/blog/default.jpg',
                f'image: "{img_url}"'
            )
            fixed_images += 1

    if content != original:
        with open(f, 'w', encoding='utf-8') as fh:
            fh.write(content)
        fixed_links += 1

    total += 1

print(f"Processed {total} blog posts")
print(f"Fixed links/content in: {fixed_links} files")
print(f"Extracted cover images in: {fixed_images} files")
