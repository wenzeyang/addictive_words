"""Offline packaging and invariant checks for 上瘾单词; translation is supplied by the agent."""
from __future__ import annotations
import argparse
import csv
import gzip
import hashlib
import html
import json
import math
import re
import shutil
import sys
from pathlib import Path

SKILL = Path(__file__).resolve().parents[1]
BUNDLED = {"CET4": SKILL / "assets/lexicons/cet4.txt", "IELTS": SKILL / "assets/lexicons/ielts.txt"}
TAGGED_DATABASE = SKILL / "assets/lexicons/tagged-vocabulary-v15.json.gz"
LIST_LABELS = {
 "gmat":"GMAT", "gre":"GRE", "sat":"SAT", "tem8":"专八", "tem4":"专四",
 "pep-high":"人教高中", "cet6":"六级", "cet4":"四级", "business":"商务英语",
 "fltrp-junior":"外研社初中", "toefl":"托福", "postgrad":"考研", "ielts":"雅思",
 "highschool":"高中", "pep-junior":"人教版初中", "pep-primary":"人教小学", "toeic":"托业"
}
DEFAULT_LISTS = tuple(LIST_LABELS)
PEP_BASIC_LISTS = ("pep-junior", "pep-primary")
REVIEWED = {"reviewed", "reviewed_with_issues"}
TYPES = {"noun", "adjective_noun", "verb_phrase", "idiom", "relative_clause", "participle", "infinitive", "clause", "other"}
SPELLINGS = {"favour": "favor", "colour": "color", "honour": "honor", "labour": "labor", "neighbour": "neighbor", "behaviour": "behavior", "centre": "center", "theatre": "theater", "offence": "offense", "defence": "defense", "analyse": "analyze", "organise": "organize", "realise": "realize", "recognise": "recognize", "traveller": "traveler", "grey": "gray"}
IRREGULAR = {
 "be":"am is are was were been being", "have":"has had having", "do":"does did done doing",
 "go":"goes went gone going", "come":"came coming", "run":"ran running", "take":"took taken taking",
 "give":"gave given giving", "make":"made making", "get":"got gotten getting", "set":"set setting",
 "put":"put putting", "cut":"cut cutting", "hit":"hit hitting", "let":"let letting", "sit":"sat sitting",
 "stand":"stood standing", "lie":"lay lain lying", "lay":"laid laying", "say":"said saying",
 "tell":"told telling", "speak":"spoke spoken speaking", "think":"thought thinking", "know":"knew known knowing",
 "see":"saw seen seeing", "hear":"heard hearing", "find":"found finding", "hold":"held holding",
 "keep":"kept keeping", "feel":"felt feeling", "leave":"left leaving", "meet":"met meeting",
 "read":"read reading", "write":"wrote written writing", "begin":"began begun beginning",
 "break":"broke broken breaking", "bring":"brought bringing", "buy":"bought buying", "catch":"caught catching",
 "choose":"chose chosen choosing", "draw":"drew drawn drawing", "drink":"drank drunk drinking",
 "drive":"drove driven driving", "eat":"ate eaten eating", "fall":"fell fallen falling",
 "fly":"flew flown flying", "forget":"forgot forgotten forgetting", "grow":"grew grown growing",
 "hide":"hid hidden hiding", "lead":"led leading", "lose":"lost losing", "pay":"paid paying",
 "ride":"rode ridden riding", "rise":"rose risen rising", "sell":"sold selling", "send":"sent sending",
 "shake":"shook shaken shaking", "show":"showed shown showing", "sing":"sang sung singing",
 "sleep":"slept sleeping", "spend":"spent spending", "steal":"stole stolen stealing", "swim":"swam swum swimming",
 "teach":"taught teaching", "throw":"threw thrown throwing", "wear":"wore worn wearing",
 "win":"won winning", "withdraw":"withdrew withdrawn withdrawing", "fight":"fought fighting",
 "man":"men", "woman":"women", "child":"children", "person":"people persons", "foot":"feet",
 "tooth":"teeth", "mouse":"mice", "goose":"geese", "knife":"knives", "life":"lives",
 "wife":"wives", "leaf":"leaves", "wolf":"wolves", "shelf":"shelves", "good":"better best",
 "bad":"worse worst", "little":"less least", "much":"more most", "many":"more most"
}

class Invalid(ValueError):
    pass

def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))

def write_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def digest(data):
    return hashlib.sha256(data).hexdigest()

def choose_translation_variant(candidates, used_counts=None, seed_material=""):
    """Choose among agent-ranked translation candidates without guessing semantics.

    Each candidate is ``{"text": str, "fit": number}``; ``fit`` is assigned after
    contextual review.  Highest fit wins, then the least-used chapter-local form,
    then a stable pseudo-random tie break so repeated builds stay reproducible.
    The caller owns and updates ``used_counts`` and resets it at chapter boundaries.
    """
    if not isinstance(candidates, list) or not candidates:
        raise Invalid("translation variants require a non-empty candidate list")
    normalized = []
    for candidate in candidates:
        if not isinstance(candidate, dict):
            raise Invalid("translation variant candidates must be objects")
        text = candidate.get("text", "")
        fit = candidate.get("fit")
        if not isinstance(text, str) or not text.strip():
            raise Invalid("translation variant text must be non-empty")
        if not isinstance(fit, (int, float)) or isinstance(fit, bool):
            raise Invalid("translation variant fit must be numeric")
        normalized.append(dict(candidate, text=text.strip(), fit=fit))
    best_fit = max(candidate["fit"] for candidate in normalized)
    pool = [candidate for candidate in normalized if candidate["fit"] == best_fit]
    counts = used_counts or {}
    least_used = min(counts.get(candidate["text"].casefold(), 0) for candidate in pool)
    pool = [candidate for candidate in pool if counts.get(candidate["text"].casefold(), 0) == least_used]
    stable_payload = json.dumps([candidate["text"] for candidate in pool], ensure_ascii=False, separators=(",", ":"))
    index = int(hashlib.sha256((str(seed_material) + "\0" + stable_payload).encode("utf-8")).hexdigest(), 16) % len(pool)
    selected = dict(pool[index])
    selected["selection_reason"] = "semantic_best" if len([x for x in normalized if x["fit"] == best_fit]) == 1 else ("least_used" if len(pool) == 1 else "seeded_tie_break")
    return selected

def sentence_spans(text):
    """Chinese reading text: punctuation runs + closing quotes form one boundary."""
    spans, start, i = [], 0, 0
    while i < len(text):
        if text[i] in "。！？!?":
            j = i + 1
            while j < len(text) and text[j] in "。！？!?":
                j += 1
            while j < len(text) and text[j] in "”’\"'」』）)]}":
                j += 1
            if text[start:j].strip():
                spans.append((start, j))
            start, i = j, j
        else:
            i += 1
    if text[start:].strip():
        spans.append((start, len(text)))
    elif spans and start < len(text):
        spans[-1] = (spans[-1][0], len(text))
    return spans

def density_target(zh, en, kind, config, budget):
    """Return the advisory number of reliable candidates for one paragraph."""
    if kind != "body" or config.get("density_mode", "adaptive") == "off":
        return 0
    han_step = config.get("density_han_chars_per_unit", 32)
    en_step = config.get("density_english_words_per_unit", 20)
    if type(han_step) is not int or han_step <= 0:
        raise Invalid("density_han_chars_per_unit must be a positive integer")
    if type(en_step) is not int or en_step <= 0:
        raise Invalid("density_english_words_per_unit must be a positive integer")
    han = len(re.findall(r"[\u3400-\u9fff]", zh))
    words = len(re.findall(r"[A-Za-z]+(?:-[A-Za-z]+)*", en))
    raw = math.ceil(max(han / han_step, words / en_step)) if han or words else 0
    sentences = len(sentence_spans(zh))
    return min(raw, sentences * budget) if sentences else 0

def regular_forms(word):
    forms = {word, word + "s", word + "es", word + "ed", word + "ing"}
    # Comparative morphology is allowed; derivational adverbs and prefixes are not.
    forms |= {word + "er", word + "est"}
    if word.endswith("e"):
        forms |= {word + "d", word[:-1] + "ing", word + "r", word + "st"}
    if len(word) > 1 and word.endswith("y") and word[-2] not in "aeiou":
        forms |= {word[:-1] + ending for ending in ("ies", "ied", "ier", "iest")}
    if word.endswith("ie"):
        forms.add(word[:-2] + "ying")
    if len(word) >= 3 and word[-1] not in "aeiouwxy" and word[-2] in "aeiou" and word[-3] not in "aeiou":
        forms |= {word + word[-1] + ending for ending in ("ed", "ing", "er", "est")}
    forms |= set(IRREGULAR.get(word, "").split())
    return forms

def form_relation(lemma, surface):
    lemma, surface = lemma.lower(), surface.lower()
    if surface == lemma:
        return "exact"
    alternatives = {lemma}
    for a, b in SPELLINGS.items():
        if lemma == a: alternatives.add(b)
        if lemma == b: alternatives.add(a)
    if surface in alternatives:
        return "spelling"
    if any(surface in regular_forms(w) for w in alternatives):
        return "inflection"
    return None

def locate(text, span, unit, prefix):
    if not isinstance(span, str) or not span:
        raise Invalid(prefix + "_span_empty")
    start_key, occurrence_key = prefix + "_start", prefix + "_occurrence"
    if start_key in unit:
        start = unit[start_key]
        if type(start) is not int or start < 0 or text[start:start + len(span)] != span:
            raise Invalid(prefix + "_offset_mismatch")
        return start, start + len(span)
    starts = [m.start() for m in re.finditer("(?=" + re.escape(span) + ")", text)]
    if not starts:
        raise Invalid(prefix + "_span_not_found")
    if occurrence_key not in unit and len(starts) > 1:
        raise Invalid(prefix + "_span_ambiguous")
    occurrence = unit.get(occurrence_key, 0)
    if type(occurrence) is not int or not 0 <= occurrence < len(starts):
        raise Invalid(prefix + "_occurrence_out_of_range")
    start = starts[occurrence]
    return start, start + len(span)

def load_tagged_database(config):
    value = config.get("lexicon_database", "bundled:current")
    if value != "bundled:current":
        raise Invalid("Unknown tagged lexicon database: " + str(value))
    raw = TAGGED_DATABASE.read_bytes()
    try: data = json.loads(gzip.decompress(raw).decode("utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc: raise Invalid("Tagged lexicon database is invalid: " + str(exc))
    if data.get("schema_version") != 1 or not isinstance(data.get("entries"), list):
        raise Invalid("Unsupported tagged lexicon database schema")
    selected = config.get("lexicon_lists", list(DEFAULT_LISTS))
    excluded = config.get("excluded_lexicons", [])
    if not isinstance(selected, list) or not selected or any(x not in LIST_LABELS for x in selected):
        raise Invalid("config.lexicon_lists must contain known database list IDs")
    if not isinstance(excluded, list) or any(x not in LIST_LABELS for x in excluded):
        raise Invalid("config.excluded_lexicons must contain known database list IDs")
    selected, excluded = list(dict.fromkeys(selected)), list(dict.fromkeys(excluded))
    blocked = {e["en"].casefold() for e in data["entries"] if set(e.get("lists", [])) & set(excluded)}
    result = {LIST_LABELS[list_id]: set() for list_id in selected}
    for entry in data["entries"]:
        word = entry.get("en", "").strip().casefold()
        if not word or word in blocked: continue
        for list_id in selected:
            if list_id in entry.get("lists", []): result[LIST_LABELS[list_id]].add(word)
    result = {label: words for label, words in result.items() if words}
    if not result: raise Invalid("Tagged lexicon selection is empty")
    provenance = [dict(label="当前统一词库数据库", path=str(TAGGED_DATABASE.resolve()), count=len(data["entries"]),
        sha256=digest(raw), membership="multi-label headword", source_version=data.get("source", {}).get("version"),
        selected=[dict(id=x, label=LIST_LABELS[x], eligible=len(result.get(LIST_LABELS[x], set()))) for x in selected],
        excluded=[dict(id=x, label=LIST_LABELS[x]) for x in excluded], exclusion_rule="any excluded tag removes the headword from every selected list")]
    return result, provenance

def load_lexicons(config, project):
    if "lexicons" not in config:
        return load_tagged_database(config)
    specs = config["lexicons"]
    if not isinstance(specs, dict) or not specs:
        raise Invalid("config.lexicons must map labels to word-list paths")
    result, provenance = {}, []
    for label, value in specs.items():
        if not isinstance(label, str) or not isinstance(value, str):
            raise Invalid("lexicon names and paths must be strings")
        if value.startswith("bundled:"):
            key = value.split(":", 1)[1]
            if key not in BUNDLED: raise Invalid("Unknown bundled lexicon: " + key)
            path = BUNDLED[key]
        else:
            path = Path(value)
            if not path.is_absolute(): path = project / path
        raw = path.read_bytes()
        words = {s.strip().casefold() for s in raw.decode("utf-8-sig").splitlines() if s.strip() and not s.lstrip().startswith("#")}
        if not words: raise Invalid("Empty lexicon: " + str(path))
        result[label] = words
        provenance.append(dict(label=label, path=str(path.resolve()), count=len(words), sha256=digest(raw), membership="headword only"))
    return result, provenance

def initialize(source, project, language, split="blank", encoding="utf-8-sig", title=None, pep_basic="keep"):
    source, project = Path(source).resolve(), Path(project).resolve()
    raw = source.read_bytes()
    try: text = raw.decode(encoding)
    except UnicodeError as exc: raise Invalid("Decode failed; specify the actual --encoding. " + str(exc))
    if split == "line":
        chunks = [s.rstrip("\r\n") for s in text.splitlines(keepends=True) if s.strip()]
    else:
        chunks = [s.strip("\r\n") for s in re.split(r"\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*", text) if s.strip()]
    if not chunks: raise Invalid("No source paragraphs")
    project.mkdir(parents=True, exist_ok=False)
    snapshot = "source_original" + (source.suffix or ".txt")
    shutil.copyfile(source, project / snapshot)
    immutable = [dict(id=f"p{i:05}", source=s) for i, s in enumerate(chunks, 1)]
    write_json(project / "source_manifest.json", dict(schema_version=1, language=language, original_name=source.name,
        snapshot=snapshot, sha256=digest(raw), encoding=encoding, split=split, paragraphs=immutable))
    paragraphs = [dict(p, zh=p["source"] if language == "zh" else "", en=p["source"] if language == "en" else "",
        kind="body", review_status="pending", issues=[], units=[]) for p in immutable]
    if pep_basic not in {"keep", "exclude"}: raise Invalid("pep_basic must be keep or exclude")
    book = dict(schema_version=1, title=title or source.stem, source_language=language,
        config=dict(max_per_sentence=2, mode="both", density_mode="adaptive",
            density_han_chars_per_unit=32, density_english_words_per_unit=20,
            lexicon_database="bundled:current",
            lexicon_lists=list(DEFAULT_LISTS), excluded_lexicons=list(PEP_BASIC_LISTS) if pep_basic == "exclude" else [],
            pep_basic_policy=pep_basic, known_words=[]),
        paragraphs=paragraphs, terminology=[], review_notes=[])
    write_json(project / "book.json", book)
    return dict(project=str(project), paragraphs=len(paragraphs), next="Fill translations, review status and units in book.json; then build.")

def prepare(project, mode=None, max_per_sentence=None, allow_partial=False):
    project = Path(project).resolve()
    book = read_json(project / "book.json")
    manifest = read_json(project / "source_manifest.json")
    if book.get("schema_version") != 1 or manifest.get("schema_version") != 1: raise Invalid("Unsupported schema version")
    snapshot = (project / manifest["snapshot"]).resolve()
    if snapshot.parent != project: raise Invalid("Snapshot must be inside project")
    if digest(snapshot.read_bytes()) != manifest["sha256"]: raise Invalid("Source snapshot changed")
    language = book.get("source_language")
    if language not in {"zh", "en"} or language != manifest["language"]: raise Invalid("Source language changed")
    paragraphs = book.get("paragraphs", [])
    originals = manifest["paragraphs"]
    if [p.get("id") for p in paragraphs] != [p["id"] for p in originals]: raise Invalid("Paragraph IDs or order changed")
    if len({p['id'] for p in paragraphs}) != len(paragraphs): raise Invalid("Duplicate paragraph IDs")
    config = book.get("config", {})
    mode = mode or config.get("mode", "both")
    if mode not in {"both", "backfill", "bilingual"}: raise Invalid("Invalid output mode")
    budget = max_per_sentence if max_per_sentence is not None else config.get("max_per_sentence", 2)
    if type(budget) is not int or budget < 0: raise Invalid("max_per_sentence must be a nonnegative integer")
    lexicons, provenance = load_lexicons(config, project) if mode != "bilingual" else ({}, [])
    known = {s.casefold() for s in config.get("known_words", [])}
    pending, cards, rejected, seen = [], [], [], set()
    checked = []
    for p, original in zip(paragraphs, originals):
        pid = p["id"]
        if p.get("source") != original["source"] or p.get(language) != original["source"]:
            raise Invalid("Original-language paragraph was edited: " + pid)
        if p.get("kind", "body") not in {"body", "heading", "metadata"}: raise Invalid("Invalid paragraph kind: " + pid)
        if p.get("review_status") == "reviewed_with_issues" and not p.get("issues"):
            raise Invalid("reviewed_with_issues requires an issue record: " + pid)
        ready = bool(p.get("zh", "").strip()) and bool(p.get("en", "").strip()) and p.get("review_status") in REVIEWED
        if not ready: pending.append(pid)
        q = dict(p, ready=ready, sentences=sentence_spans(p.get("zh", "")), selected=[], cards=[])
        q["density_target"] = density_target(p.get("zh", ""), p.get("en", ""), p.get("kind", "body"), config, budget) if ready else 0
        checked.append(q)
        if not ready or mode == "bilingual": continue
        for n, unit in enumerate(p.get("units", []), 1):
            uid = unit.get("id", f"{pid}-u{n:03}")
            if uid in seen: raise Invalid("Duplicate unit ID: " + uid)
            seen.add(uid)
            try:
                if unit.get("reviewed") is not True: raise Invalid("unit_not_reviewed")
                if unit.get("type") not in TYPES: raise Invalid("unknown_unit_type")
                if not str(unit.get("meaning", "")).strip(): raise Invalid("missing_contextual_meaning")
                a, b = locate(p["zh"], unit.get("zh"), unit, "zh")
                x, y = locate(p["en"], unit.get("en"), unit, "en")
                targets, target_rejections = [], []
                for target in unit.get("targets", []):
                    lemma, surface = target.get("lemma", "").strip().lower(), target.get("surface", "").strip()
                    if not lemma or not surface: target_rejections.append("empty_target"); continue
                    if not re.search(r"(?<![A-Za-z-])" + re.escape(surface) + r"(?![A-Za-z-])", unit["en"], re.I):
                        target_rejections.append(lemma + ":surface_not_found"); continue
                    relation = form_relation(lemma, surface)
                    if not relation: target_rejections.append(lemma + ":unverified_word_form"); continue
                    tags = [k for k, words in lexicons.items() if lemma in words]
                    if not tags: target_rejections.append(lemma + ":no_lexicon_hit"); continue
                    if lemma in known: target_rejections.append(lemma + ":known_word"); continue
                    targets.append(dict(lemma=lemma, surface=surface, form=relation, lexicons=tags))
                if not targets: raise Invalid("no_eligible_target; " + "; ".join(target_rejections))
                containers = [i for i, (sa, sb) in enumerate(q["sentences"]) if sa <= a < b <= sb]
                priority = unit.get("priority", 5)
                if not isinstance(priority, (int, float)) or not 0 <= priority <= 10: raise Invalid("priority_out_of_range")
                reading = unit.get("backfill", True) is True and p.get("kind", "body") == "body" and len(containers) == 1
                reason = "eligible" if reading else ("cross_sentence" if len(containers) != 1 else "card_only")
                card = dict(id=uid, paragraph_id=pid, zh=unit["zh"], en=unit["en"], zh_start=a, zh_end=b,
                    en_start=x, en_end=y, targets=targets, rejected_targets=target_rejections,
                    type=unit["type"], meaning=unit["meaning"], pattern=unit.get("pattern", unit["en"]),
                    note=unit.get("note", ""), priority=priority, sentence=containers[0] if containers else None,
                    can_backfill=reading, selection_reason=reason, selected=False, zh_context=p["zh"], en_context=p["en"])
                cards.append(card); q["cards"].append(card)
            except Invalid as exc:
                rejected.append(dict(id=uid, paragraph_id=pid, reason=str(exc), unit=unit))
        ranked = sorted((c for c in q["cards"] if c["can_backfill"]), key=lambda c:(-c["priority"], 0 if c["type"]=="noun" else 1, c["zh_start"], -len(c["zh"])))
        counts, sentence_words = {}, {}
        for c in ranked:
            s = c["sentence"]
            words = {t["lemma"] for t in c["targets"]}
            if any(c["zh_start"] < other["zh_end"] and other["zh_start"] < c["zh_end"] for other in q["selected"]):
                c["selection_reason"] = "overlap"; continue
            if words & sentence_words.get(s, set()): c["selection_reason"] = "repeated_target_in_sentence"; continue
            if counts.get(s, 0) >= budget: c["selection_reason"] = "sentence_limit"; continue
            c["selected"] = True; c["selection_reason"] = "selected"; q["selected"].append(c)
            counts[s] = counts.get(s, 0) + 1
            sentence_words.setdefault(s, set()).update(words)
        q["selected"].sort(key=lambda c:c["zh_start"])
    if pending and not allow_partial: raise Invalid("Untranslated or unreviewed paragraphs: " + ", ".join(pending[:20]))
    total = 0
    for p in checked:
        cursor, segments = 0, []
        for c in p["selected"]:
            segments.extend([dict(text=p["zh"][cursor:c["zh_start"]]), dict(unit_id=c["id"], zh=c["zh"], en=c["en"])])
            cursor = c["zh_end"]
        segments.append(dict(text=p.get("zh", "")[cursor:]))
        if "".join(s.get("zh", s.get("text", "")) for s in segments) != p.get("zh", ""):
            raise Invalid("Chinese roundtrip failed: " + p["id"])
        p["segments"] = segments
        p["reading"] = "".join(s["en"] + "（" + s["zh"] + "）" if "unit_id" in s else s["text"] for s in segments)
        total += len(p["selected"])
    density_target_total = sum(p.get("density_target", 0) for p in checked)
    density_shortfall_paragraphs = [p["id"] for p in checked if len(p.get("selected", [])) < p.get("density_target", 0)]
    stats = dict(paragraphs=len(checked), reviewed=len(checked)-len(pending), pending=pending, cards=len(cards),
        replacements=total, rejected=len(rejected), max_per_sentence=budget, mode=mode,
        density_mode=config.get("density_mode", "adaptive"), density_target=density_target_total,
        density_shortfall=len(density_shortfall_paragraphs), density_shortfall_paragraphs=density_shortfall_paragraphs,
        source_unchanged=True, chinese_roundtrip_exact=True, status="partial" if pending else "complete")
    return dict(title=book.get("title", "小说阅读"), source_language=language, paragraphs=checked, cards=cards,
        rejected=rejected, stats=stats, lexicons=provenance, terminology=book.get("terminology", []), review_notes=book.get("review_notes", []))

def reading_html(result):
    template = (SKILL / "assets/reader.html").read_text(encoding="utf-8")
    payload = json.dumps(result, ensure_ascii=False).replace("<", "\\u003c")
    return template.replace("__TITLE__", html.escape(result["title"])).replace("__DATA__", payload)

def build(project, mode=None, max_per_sentence=None, allow_partial=False):
    project = Path(project).resolve()
    result = prepare(project, mode, max_per_sentence, allow_partial)
    # Keep each output version separate; never silently overwrite a reader's earlier result.
    output = project / "output"
    index = 2
    while output.exists():
        output = project / f"output-{index:03}"
        index += 1
    output.mkdir()
    write_json(output / "aligned.json", result)
    write_json(output / "validation.json", result["stats"])
    write_json(output / "rejected-units.json", result["rejected"])
    header = result["title"] + ("【阶段预览：未完成】" if result["stats"]["pending"] else "") + "\n\n"
    for lang, filename in [("zh","中文.txt"),("en","English.txt")]:
        (output / filename).write_text(header + "\n\n".join(p.get(lang, "") or "【待译】" for p in result["paragraphs"]), encoding="utf-8-sig")
    if result["stats"]["mode"] in {"both", "bilingual"}:
        (output / "中英逐段对照.txt").write_text(header + "\n\n".join(
            f"[{p['id']}]\n中文：{p.get('zh') or '【待译】'}\n\nEnglish:\n{p.get('en') or '[Pending translation]'}" for p in result["paragraphs"]), encoding="utf-8-sig")
    if result["stats"]["mode"] in {"both", "backfill"}:
        (output / "英文回填阅读.txt").write_text(header + f"每句最多{result['stats']['max_per_sentence']}处；没有每段总量限制。括注保留原中文。\n\n" + "\n\n".join(
            f"[{p['id']}] {p['reading'] or '【待译】'}" for p in result["paragraphs"]), encoding="utf-8-sig")
    with (output / "学习卡.csv").open("w", encoding="utf-8-sig", newline="") as f:
        fields = ["id","paragraph_id","en","zh","type","pattern","meaning","note","targets","selected","selection_reason","en_context","zh_context"]
        writer = csv.DictWriter(f, fields, extrasaction="ignore"); writer.writeheader()
        for c in result["cards"]: writer.writerow(dict(c, targets=json.dumps(c["targets"],ensure_ascii=False)))
    (output / "阅读.html").write_text(reading_html(result), encoding="utf-8")
    notes = ["审校记录", "程序检查保证结构不等于语义、史实或独立人工终审。", "术语：", json.dumps(result["terminology"],ensure_ascii=False,indent=2), "全局说明：", json.dumps(result["review_notes"],ensure_ascii=False,indent=2)]
    for p in result["paragraphs"]:
        if p.get("issues"): notes.append(p["id"] + " " + json.dumps(p["issues"], ensure_ascii=False))
    notes += ["词库快照（仅词头命中）：", json.dumps(result["lexicons"],ensure_ascii=False,indent=2), "未回填不等于错误：学习卡 selection_reason 记录限额、重叠、跨句等原因。"]
    (output / "审校记录.txt").write_text("\n\n".join(notes), encoding="utf-8-sig")
    return dict(output=str(output), **result["stats"])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="Create an immutable source snapshot and an editable book.json")
    init.add_argument("source", type=Path); init.add_argument("--project", type=Path, required=True)
    init.add_argument("--language", choices=["zh","en"], required=True)
    init.add_argument("--split", choices=["blank","line"], default="blank")
    init.add_argument("--encoding", default="utf-8-sig"); init.add_argument("--title")
    init.add_argument("--pep-basic", choices=["keep","exclude"], required=True,
        help="Required answer to the preflight question: keep or exclude words tagged 人教版初中/人教小学")
    for cmd in ("build","validate"):
        p = sub.add_parser(cmd)
        p.add_argument("--project", type=Path, required=True)
        p.add_argument("--mode", choices=["both","backfill","bilingual"])
        p.add_argument("--max-per-sentence", type=int)
        p.add_argument("--allow-partial", action="store_true")
    args = parser.parse_args()
    try:
        if args.command == "init":
            answer=initialize(args.source,args.project,args.language,args.split,args.encoding,args.title,args.pep_basic)
        elif args.command == "build":
            answer=build(args.project,args.mode,args.max_per_sentence,args.allow_partial)
        else:
            answer=prepare(args.project,args.mode,args.max_per_sentence,args.allow_partial)["stats"]
        print(json.dumps(answer, ensure_ascii=False, indent=2))
    except (Invalid, OSError, ValueError, KeyError, TypeError) as exc:
        print("ERROR: " + str(exc), file=sys.stderr)
        return 1
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
