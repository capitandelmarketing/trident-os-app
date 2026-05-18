#!/usr/bin/env python3
r"""
build-skills-json.py
Reads the 44 .md files from .app-upload\_TRIDENT-OS-v3-FLAT-FOR-UPLOAD\
Packages them into skills.json (used by the Trident OS web app)

Run from the trident-os-app folder:
    python build-skills-json.py
"""
import json
import re
import sys
from datetime import datetime
from pathlib import Path

SOURCE_DIR = Path(r"C:\Users\Usuario\capitan-del-marketing\.app-upload\_TRIDENT-OS-v3-FLAT-FOR-UPLOAD")
OUTPUT_FILE = Path(__file__).parent / "skills.json"

EXPECTED_COUNTS = {
    "meta_docs":      4,
    "nucleus_main":   1,
    "universal":      10,
    "language":       2,
    "nationality":    9,
    "tone":           5,
    "transversal":    3,
    "qa_validator":   4,
    "pillars":        6,
    "laurel_subskills": 5,  # v4 · Laurel 2026 sub-skills
}
EXPECTED_TOTAL = 49


def get_category(filename: str) -> str:
    prefix = filename[:2]
    if not prefix.isdigit():
        return "unknown"
    n = int(prefix)
    if 0 <= n <= 3:   return "meta_docs"
    if n == 10:       return "nucleus_main"
    if 11 <= n <= 20: return "universal"
    if 30 <= n <= 31: return "language"
    if 40 <= n <= 48: return "nationality"
    if 50 <= n <= 54: return "tone"
    if 60 <= n <= 62: return "transversal"
    if 70 <= n <= 73: return "qa_validator"
    if 80 <= n <= 85: return "pillars"
    if 90 <= n <= 99: return "laurel_subskills"
    return "unknown"


def display_name(filename: str) -> str:
    name = re.sub(r"^\d{2}-", "", filename)
    name = re.sub(r"\.md$", "", name)
    name = name.replace("-", " ")
    return name.title()


def main():
    if not SOURCE_DIR.exists():
        print(f"ERROR: Source dir not found: {SOURCE_DIR}", file=sys.stderr)
        sys.exit(1)

    files = sorted(SOURCE_DIR.glob("*.md"))
    print(f"Found {len(files)} .md files in source directory")

    skills = []
    counts = {k: 0 for k in EXPECTED_COUNTS}
    counts["unknown"] = 0
    total_size = 0

    for f in files:
        content = f.read_text(encoding="utf-8")
        category = get_category(f.name)
        counts[category] += 1
        total_size += f.stat().st_size

        skills.append({
            "id":         f.stem,
            "filename":   f.name,
            "category":   category,
            "name":       display_name(f.name),
            "size_bytes": f.stat().st_size,
            "line_count": content.count("\n") + 1,
            "content":    content,
        })
        print(f"  [{category}] {f.name} ({f.stat().st_size} bytes)")

    payload = {
        "meta": {
            "version":      "v3",
            "generated_at": datetime.now().astimezone().isoformat(),
            "source_dir":   str(SOURCE_DIR),
            "total_files":  len(files),
            "total_size":   total_size,
        },
        "counts": counts,
        "expected_counts": {**EXPECTED_COUNTS, "total": EXPECTED_TOTAL},
        "skills": skills,
    }

    OUTPUT_FILE.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print()
    print(f"Wrote {OUTPUT_FILE}")
    print(f"Total: {len(files)} files / {round(total_size/1024, 1)} KB")
    print()
    print("Category breakdown:")
    all_ok = True
    for k in ["meta_docs","nucleus_main","universal","language","nationality","tone","transversal","qa_validator","pillars","laurel_subskills"]:
        actual = counts[k]
        expected = EXPECTED_COUNTS[k]
        status = "OK" if actual == expected else f"MISMATCH (expected {expected})"
        if actual != expected:
            all_ok = False
        print(f"  {k:15s} {actual:3d} [{status}]")
    if counts.get("unknown", 0):
        print(f"  unknown         {counts['unknown']:3d} [UNEXPECTED]")
        all_ok = False
    print()
    print("ALL CATEGORIES OK." if all_ok else "WARNING: some categories mismatch expected counts.")


if __name__ == "__main__":
    main()
