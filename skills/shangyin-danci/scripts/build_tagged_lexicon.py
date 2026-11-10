"""Rebuild the skill's compact multi-label lexicon from the app conversion database."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
from pathlib import Path

PREFIX = "window.CONVERSION_LEXICON="
LABELS = {
 "gmat":"GMAT", "gre":"GRE", "sat":"SAT", "tem8":"专八", "tem4":"专四",
 "pep-high":"人教高中", "cet6":"六级", "cet4":"四级", "business":"商务英语",
 "fltrp-junior":"外研社初中", "toefl":"托福", "postgrad":"考研", "ielts":"雅思",
 "highschool":"高中", "pep-junior":"人教版初中", "pep-primary":"人教小学", "toeic":"托业"
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = args.source.read_bytes()
    text = raw.decode("utf-8")
    if not text.startswith(PREFIX) or not text.rstrip().endswith(";"):
        raise SystemExit("unexpected conversion lexicon wrapper")
    source = json.loads(text[len(PREFIX):].rstrip()[:-1])
    merged = {}
    for entry in source["entries"]:
        word = entry.get("en", "").strip().casefold()
        lists = [x for x in entry.get("lists", []) if x in LABELS]
        if word and lists: merged.setdefault(word, set()).update(lists)
    entries = [dict(en=word, lists=sorted(lists)) for word, lists in sorted(merged.items())]
    counts = {key:sum(key in e["lists"] for e in entries) for key in LABELS}
    payload = dict(schema_version=1, source=dict(name=args.source.name, version=source.get("version"),
        sha256=hashlib.sha256(raw).hexdigest(), entries=len(entries)),
        lists=[dict(id=key, label=label, count=counts[key]) for key, label in LABELS.items()], entries=entries)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(gzip.compress(encoded, compresslevel=9, mtime=0))
    metadata = dict(source=payload["source"], asset=args.output.name,
        asset_sha256=hashlib.sha256(args.output.read_bytes()).hexdigest(), compressed_bytes=args.output.stat().st_size,
        uncompressed_bytes=len(encoded), lists=payload["lists"])
    args.output.with_suffix("").with_suffix(".sources.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
