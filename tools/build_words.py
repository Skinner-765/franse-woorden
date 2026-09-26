#!/usr/bin/env python3
"""Builds words.json from an export of the artifact database (collection "woorden").

Input: a file with one JSON document per line, exactly as ArtifactData "list"
returns them, e.g.
  {"id":"au-port","data":{"fr":"au port","nl":"in de haven",...},"version":1,...}

Usage:
  python3 tools/build_words.py export.jsonl            # writes words.json
  python3 tools/build_words.py export.jsonl --check    # validate only

Only the fields the widget needs are kept, sorted by id, so an unchanged list
produces an unchanged file (and therefore no commit).

Safety: on an empty or broken export the script exits with an error without
touching words.json. The widget then simply keeps showing the previous list.
"""
import json
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "words.json"

# Fields passed on to the widget:
#   fr, nl             -> what is shown on screen
#   example            -> example sentence (only on the larger home screen widget)
#   nextReview         -> is the word due? Then it is shown more often
#   correct/incorrect  -> wrong more often = shown more often
#   note, theme        -> not shown, but useful to keep
FIELDS = ["fr", "nl", "example", "note", "theme", "nextReview", "correct", "incorrect"]


def load_rows(path):
    """Reads the export line by line; lines that are not JSON objects are skipped."""
    rows = []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line.startswith("{"):
            continue  # skip header/footer lines of the tool output
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as e:
            sys.exit(f"Line {n} is not valid JSON: {e}")
    return rows


def build(rows):
    """Converts raw database rows into compact word entries for the widget."""
    words = []
    for r in rows:
        d = r.get("data", r)
        if not d.get("fr") or not d.get("nl"):
            sys.exit(f"Word without fr/nl: {r.get('id')}")
        w = {"id": r.get("id") or d["fr"]}
        for f in FIELDS:
            v = d.get(f)
            if v in (None, ""):
                continue
            if f in ("correct", "incorrect"):
                v = int(v)
            w[f] = v
        words.append(w)
    words.sort(key=lambda w: w["id"])
    if not words:
        sys.exit("No words found in the export — nothing written.")
    return words


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    words = build(load_rows(sys.argv[1]))
    if "--check" in sys.argv:
        print(f"OK: {len(words)} words")
        return

    # Only bump updatedAt when the words themselves changed.
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    stamp = old.get("updatedAt") if old.get("words") == words else date.today().isoformat()
    out = {"updatedAt": stamp, "count": len(words), "words": words}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"words.json written: {len(words)} words (updatedAt {stamp})")


if __name__ == "__main__":
    main()
