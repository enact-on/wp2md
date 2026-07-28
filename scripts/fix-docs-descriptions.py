#!/usr/bin/env python3
"""Auto-generate descriptions for docs that are missing them."""
import re, pathlib

docs_dir = pathlib.Path(r"D:\AI Coditor\neonspark-astro\src\content\docs")
fixed = 0

for f in docs_dir.rglob("index.mdx"):
    with open(f, encoding="utf-8", errors="replace") as fh:
        content = fh.read()

    fm_end = content.find("\n---\n", 4)
    if fm_end < 0:
        continue
    frontmatter = content[4:fm_end]
    body = content[fm_end + 4:]

    desc_match = re.search(r'^description:\s*(.+)$', frontmatter, re.M)
    desc_val = desc_match.group(1).strip().strip('"\'') if desc_match else ''

    if not desc_val:
        clean = re.sub(r'!\[[^\]]*\]\([^\)]*\)', '', body)
        clean = re.sub(r'\[[^\]]*\]\(([^\)]*)\)', r'\1', clean)
        clean = re.sub(r'#+\s+', '', clean)
        clean = re.sub(r'[*_`]', '', clean)
        clean = re.sub(r'\s+', ' ', clean).strip()

        desc = clean[:160]
        if len(clean) > 160:
            m = re.search(r'^.{60,160}[.!?]', clean)
            if m:
                desc = m.group(0)
            else:
                desc = clean[:157] + '...'

        desc = desc.replace('"', '').replace('\n', ' ').strip()
        if len(desc) < 20:
            continue

        if desc_match:
            new_fm = re.sub(
                r'^description:.*$',
                'description: "' + desc + '"',
                frontmatter,
                flags=re.M
            )
        else:
            new_fm = re.sub(
                r'^(title:.*$)',
                r'\1\ndescription: "' + desc + '"',
                frontmatter,
                flags=re.M,
                count=1
            )

        new_content = "---\n" + new_fm + "\n---\n" + body
        if new_content != content:
            with open(f, 'w', encoding='utf-8') as fh:
                fh.write(new_content)
            fixed += 1

print(f"Fixed descriptions in {fixed} docs")
