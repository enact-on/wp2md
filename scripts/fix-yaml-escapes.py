#!/usr/bin/env python3
"""Fix invalid YAML escape sequences in doc MDX frontmatter."""
import re, pathlib

docs = pathlib.Path(r"D:\AI Coditor\neonspark-astro\src\content\docs")
fixed = 0

# Valid YAML escape chars in double-quoted strings
VALID = set('ntrfb\\"/uU01234567 ')

for f in docs.rglob("index.mdx"):
    with open(f, encoding="utf-8", errors="replace") as fh:
        content = fh.read()

    fm_end = content.find("\n---\n", 4)
    if fm_end < 0:
        continue

    frontmatter = content[4:fm_end]

    # Replace \<invalid> → just remove the backslash
    def fix_escapes(m):
        char = m.group(1)
        if char in VALID:
            return "\\" + char
        return char  # strip the backslash

    new_fm = re.sub(r"\\(.)", fix_escapes, frontmatter)

    if new_fm != frontmatter:
        new_content = "---\n" + new_fm + "\n---\n" + content[fm_end + 4:]
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(new_content)
        fixed += 1

print(f"Fixed {fixed} files")
