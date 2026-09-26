#!/usr/bin/env python3
"""Bouwt woorden.json op uit een export van de artifact-database (collection "woorden").

Invoer: een bestand met één JSON-document per regel, exact zoals ArtifactData "list"
ze teruggeeft, bv.
  {"id":"au-port","data":{"fr":"au port","nl":"in de haven",...},"version":1,...}

Gebruik:
  python3 tools/build_woorden.py export.jsonl            # schrijft woorden.json
  python3 tools/build_woorden.py export.jsonl --check    # enkel valideren

Het script houdt alleen de velden die de widget nodig heeft en sorteert op id,
zodat een ongewijzigde lijst ook een ongewijzigd bestand (en dus geen commit) geeft.
"""
import json
import sys
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "woorden.json"
FIELDS = ["fr", "nl", "example", "note", "theme", "nextReview", "correct", "incorrect"]


def load_rows(path):
    rows = []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line.startswith("{"):
            continue  # sla kop/voetregels van de tool-output over
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as e:
            sys.exit(f"Regel {n} is geen geldige JSON: {e}")
    return rows


def build(rows):
    woorden = []
    for r in rows:
        d = r.get("data", r)
        if not d.get("fr") or not d.get("nl"):
            sys.exit(f"Woord zonder fr/nl: {r.get('id')}")
        w = {"id": r.get("id") or d["fr"]}
        for f in FIELDS:
            v = d.get(f)
            if v in (None, ""):
                continue
            if f in ("correct", "incorrect"):
                v = int(v)
            w[f] = v
        woorden.append(w)
    woorden.sort(key=lambda w: w["id"])
    if not woorden:
        sys.exit("Geen woorden gevonden in de export — niets geschreven.")
    return woorden


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    woorden = build(load_rows(sys.argv[1]))
    if "--check" in sys.argv:
        print(f"OK: {len(woorden)} woorden")
        return

    # updatedAt enkel verversen als de woorden zelf veranderd zijn
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    stamp = old.get("updatedAt") if old.get("woorden") == woorden else date.today().isoformat()
    out = {"updatedAt": stamp, "count": len(woorden), "woorden": woorden}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"woorden.json geschreven: {len(woorden)} woorden (updatedAt {stamp})")


if __name__ == "__main__":
    main()
