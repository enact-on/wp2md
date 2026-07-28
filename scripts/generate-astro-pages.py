#!/usr/bin/env python3
"""
Generate Astro content files from enactsoft-split JSON output.

Handles:
  - clone scripts  → src/content/clone-scripts/
  - missing case studies (cashdrill, cashtipay, realcash) → src/content/works/
  - missing solutions (affiliatetrack, affport, …) → src/content/services/
  - standalone pages (privacy-policy, terms, …) → src/content/pages/
"""

import json, os, re, pathlib, textwrap, html

SPLIT_DIR = pathlib.Path(r"D:\AI Coditor\wordpress-export-to-markdown\output\enactsoft-split\page")
ASTRO_ROOT = pathlib.Path(r"D:\AI Coditor\neonspark-astro\src\content")

# ── helpers ──────────────────────────────────────────────────────────────────

def load(slug):
    p = SPLIT_DIR / f"{slug}.json"
    if not p.exists():
        return None
    with open(p, encoding="utf-8", errors="replace") as f:
        return json.load(f)

def strip_html(h):
    """Strip HTML tags and decode entities, normalise whitespace."""
    text = re.sub(r"<[^>]+>", " ", h or "")
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def extract_paragraphs(html_content, min_words=8, max_paras=40):
    """Return meaningful paragraphs from WordPress block HTML."""
    # get all block-level text
    paras = []
    for tag in ["p", "li", "h2", "h3", "h4", "td", "th"]:
        for m in re.finditer(rf"<{tag}[^>]*>(.*?)</{tag}>", html_content, re.S | re.I):
            text = strip_html(m.group(1))
            if len(text.split()) >= min_words:
                if tag.startswith("h"):
                    paras.append(f"\n## {text}\n")
                elif tag == "li":
                    paras.append(f"- {text}")
                else:
                    paras.append(text)
    return paras[:max_paras]

def md_escape(s):
    """Escape YAML special chars for a single-line string value."""
    if not s:
        return '""'
    s = s.replace('"', '\\"').replace("\n", " ")
    return f'"{s}"'

def yaml_str(key, val):
    if not val:
        return ""
    return f'{key}: {md_escape(val)}\n'

# ── writers ──────────────────────────────────────────────────────────────────

def write_file(path: pathlib.Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  wrote: {path.relative_to(ASTRO_ROOT.parent.parent)}")


def make_frontmatter(title, meta_title, description, image="", draft=False, extra=""):
    return f"""---
title: {md_escape(title)}
meta_title: {md_escape(meta_title or title)}
description: {md_escape(description or "")}
image: {md_escape(image)}
draft: {"true" if draft else "false"}
{extra}---

"""


# ── clone-scripts ─────────────────────────────────────────────────────────────

CLONE_SLUGS = [
    "10-percent-clone", "benjamin-clone", "cashback-clone-script",
    "cashkaro-clone-script", "cj-affiliate-clone-script", "clickbank-clone-script",
    "cobone-clone", "coinmiles-clone", "couponchief-clone", "coupondunia-clone",
    "couponfollow-clone", "dealcatcher-clone", "earnkaro-clone-script",
    "ebuyclub-clone", "fetch-clone", "freecash-clone-script",
    "gamified-rewards-platform", "groupon-clone-script",
    "honey-clone-script-browser-extension", "hotukdeals-clone", "ibotta-clone",
    "igraal-clone", "jumptask-clone", "letyshops-clone", "lolli-clone",
    "mgamer-clone", "picodi-clone", "poll-pay-clone", "poulpeo-clone",
    "promote-financial-products-platform", "quidco-clone", "receipt-hog-clone",
    "retailmenot-clone", "shoop-clone", "shopmium-clone", "slickdeals-clone",
    "storecash-clone", "stormx-clone-script", "super-clone",
    "swagbucks-clone-script", "sweatcoin-clone", "topcashback-clone",
    "upside-clone-in-store-cashback-solution", "widilo-clone",
]

def gen_clone_scripts():
    out_dir = ASTRO_ROOT / "clone-scripts"
    count = 0
    for slug in CLONE_SLUGS:
        data = load(slug)
        if not data:
            print(f"  SKIP (not found): {slug}")
            continue

        title = data.get("title", slug.replace("-", " ").title())
        meta = data.get("meta", {})
        meta_title = meta.get("rank_math_title", "") or title
        desc = meta.get("rank_math_description", "") or ""
        content_html = data.get("content", "")

        paras = extract_paragraphs(content_html)
        body = "\n\n".join(paras) if paras else strip_html(content_html)[:2000]

        # determine related solution from content
        solution_map = {
            "cashbackos": "cashbackos", "laraback": "laraback",
            "couponorb": "couponorb", "fundback": "fundback",
            "superback": "superback", "freemoney": "freemoney-offerwall-solution",
            "cashbackapp": "cashbackapp", "cryptocashback": "cryptocashback",
            "affiliatetrack": "affiliatetrack", "affport": "affport",
            "instaback": "instaback",
        }
        related_sol = ""
        body_lower = body.lower()
        for k, v in solution_map.items():
            if k in body_lower or k in slug:
                related_sol = v
                break

        cta_line = f'\n\n---\n\n**Ready to build your own platform?** [Get a free consultation →](/contact)\n'
        if related_sol:
            cta_line += f'\nSee our [{related_sol.replace("-", " ").title()} solution](/solutions/{related_sol}) for details.\n'

        fm = make_frontmatter(
            title=title,
            meta_title=meta_title,
            description=desc,
            extra=f'badge: "Clone Script"\nrelated_solution: {md_escape(related_sol)}\n'
        )
        content_out = fm + body + cta_line
        write_file(out_dir / f"{slug}.md", content_out)
        count += 1
    print(f"Clone scripts: {count} files written.")


# ── case studies ──────────────────────────────────────────────────────────────

CASE_STUDY_SLUGS = {
    "cashdrill": {
        "technologies": ["FreeMoney", "PHP Laravel", "Offerwall Networks"],
        "badge": "Case Study",
    },
    "cashtipay": {
        "technologies": ["CashbackOS", "WordPress", "PHP Laravel"],
        "badge": "Case Study",
    },
    "realcash": {
        "technologies": ["Laraback", "PHP Laravel", "React JS"],
        "badge": "Case Study",
    },
}

def gen_case_studies():
    out_dir = ASTRO_ROOT / "works"
    count = 0
    for slug, extra_data in CASE_STUDY_SLUGS.items():
        # skip if already exists
        if (out_dir / f"{slug}.md").exists():
            print(f"  EXISTS: {slug}")
            continue

        data = load(slug)
        if not data:
            print(f"  SKIP: {slug}")
            continue

        title = data.get("title", slug.replace("-", " ").title())
        meta = data.get("meta", {})
        meta_title = meta.get("rank_math_title", "") or title
        desc = meta.get("rank_math_description", "") or ""
        content_html = data.get("content", "")

        paras = extract_paragraphs(content_html)
        body = "\n\n".join(paras) if paras else strip_html(content_html)[:3000]
        techs = extra_data.get("technologies", [])
        techs_yaml = "[" + ", ".join(f'"{t}"' for t in techs) + "]"

        fm = f"""---
title: {md_escape(title)}
meta_title: {md_escape(meta_title)}
description: {md_escape(desc)}
date: 2024-01-01T00:00:00.000Z
image: "/images/projects/project-1.png"
draft: false
technologies: {techs_yaml}
subtitle: {md_escape(desc[:120] if desc else "")}
site_demo_URL: ""
---

"""
        write_file(out_dir / f"{slug}.md", fm + body)
        count += 1
    print(f"Case studies: {count} files written.")


# ── solutions (missing service pages) ─────────────────────────────────────────

SOLUTION_SLUGS = {
    "affiliatetrack": {
        "badge": "Affiliate Tracking Software",
        "icon": "/images/icons/innovation.svg",
    },
    "affport": {
        "badge": "Affiliate Publisher Portal",
        "icon": "/images/icons/collaboration.svg",
    },
    "custom-development-add-on": {
        "badge": "Custom Development",
        "icon": "/images/icons/web-design.svg",
    },
    "enterprise-solution": {
        "badge": "Enterprise Solution",
        "icon": "/images/icons/innovation.svg",
    },
    "incent-app-development": {
        "badge": "Incentive App Development",
        "icon": "/images/icons/collaboration.svg",
    },
    "instaback": {
        "badge": "In-Store Cashback",
        "icon": "/images/icons/web-design.svg",
    },
    "perfosphere-performance-marketing-software": {
        "badge": "Performance Marketing Software",
        "icon": "/images/icons/innovation.svg",
    },
    "telegram-cashback-bot": {
        "badge": "Telegram Cashback Bot",
        "icon": "/images/icons/collaboration.svg",
    },
    "affiliate-website-development": {
        "badge": "Affiliate Website Development",
        "icon": "/images/icons/web-design.svg",
    },
    "influencer-marketing-software-development": {
        "badge": "Influencer Marketing Software",
        "icon": "/images/icons/collaboration.svg",
    },
    "marketing-software-development": {
        "badge": "Marketing Software Development",
        "icon": "/images/icons/innovation.svg",
    },
    "nutra-affiliate-website-development": {
        "badge": "Nutra Affiliate Development",
        "icon": "/images/icons/web-design.svg",
    },
}

def gen_solutions():
    out_dir = ASTRO_ROOT / "services"
    count = 0
    for slug, extra in SOLUTION_SLUGS.items():
        target = out_dir / f"{slug}.md"
        if target.exists() or (out_dir / f"{slug}.mdx").exists():
            print(f"  EXISTS: {slug}")
            continue

        data = load(slug)
        if not data:
            print(f"  SKIP: {slug}")
            continue

        title = data.get("title", slug.replace("-", " ").title())
        meta = data.get("meta", {})
        meta_title = meta.get("rank_math_title", "") or title
        desc = meta.get("rank_math_description", "") or ""
        content_html = data.get("content", "")
        paras = extract_paragraphs(content_html, min_words=6)
        body = "\n\n".join(paras) if paras else strip_html(content_html)[:3000]

        fm = f"""---
title: {md_escape(title)}
meta_title: {md_escape(meta_title)}
description: {md_escape(desc)}
image: "/images/services/web-design-service.svg"
draft: false
subtitle: {md_escape(desc[:160] if desc else "")}
badge: {md_escape(extra.get('badge', 'Solution'))}
icon: {md_escape(extra.get('icon', '/images/icons/innovation.svg'))}
benefits:
  enable: false
  title: ""
  subtitle: ""
  bullet_points: []
  image_list: []
---

"""
        write_file(target, fm + body)
        count += 1
    print(f"Solutions: {count} files written.")


# ── standalone pages ───────────────────────────────────────────────────────────

STANDALONE_SLUGS = [
    "privacy-policy",
    "terms-conditions",
    "payment-refund-policy",
    "digital-marketing-services",
    "operations-support",
    "enactsoft-reviews",
    "student-entrepreneurship-program",
    "why-choose-us",
    "portfolio",
]

def gen_standalone():
    out_dir = ASTRO_ROOT / "pages"
    count = 0
    for slug in STANDALONE_SLUGS:
        target = out_dir / f"{slug}.md"
        if target.exists():
            print(f"  EXISTS: {slug}")
            continue

        data = load(slug)
        if not data:
            print(f"  SKIP: {slug}")
            continue

        title = data.get("title", slug.replace("-", " ").title())
        meta = data.get("meta", {})
        meta_title = meta.get("rank_math_title", "") or title
        desc = meta.get("rank_math_description", "") or ""
        content_html = data.get("content", "")

        paras = extract_paragraphs(content_html, min_words=5, max_paras=60)
        body = "\n\n".join(paras) if paras else strip_html(content_html)[:4000]

        fm = f"""---
title: {md_escape(title)}
meta_title: {md_escape(meta_title)}
description: {md_escape(desc)}
image: ""
draft: false
---

"""
        write_file(target, fm + body)
        count += 1
    print(f"Standalone pages: {count} files written.")


# ── run ───────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n=== Generating clone scripts ===")
    gen_clone_scripts()
    print("\n=== Generating missing case studies ===")
    gen_case_studies()
    print("\n=== Generating missing solutions ===")
    gen_solutions()
    print("\n=== Generating standalone pages ===")
    gen_standalone()
    print("\nDone!")
