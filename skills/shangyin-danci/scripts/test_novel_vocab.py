"""Behavioral checks: sentence budgets, reversible spans and both source directions."""
import json
import tempfile
import unittest
from pathlib import Path

import novel_vocab as nv


class NovelVocabularyTests(unittest.TestCase):
    def setUp(self):
        self.test_parent = Path.cwd().resolve()
        self.temp = tempfile.TemporaryDirectory(prefix=".shangyin-test-", dir=self.test_parent)
        self.root = Path(self.temp.name)
        self.project = self.root / "book"

    def tearDown(self):
        assert self.root.resolve().parent == self.test_parent
        assert self.root.name.startswith('.shangyin-test-')
        self.temp.cleanup()

    def project_for(self, zh, en, language="zh"):
        src = self.root / "input.txt"
        src.write_text(zh if language == "zh" else en, encoding="utf-8")
        nv.initialize(src, self.project, language)
        book = nv.read_json(self.project / "book.json")
        book["paragraphs"][0].update(zh=zh, en=en, review_status="reviewed")
        return book

    def save(self, book):
        nv.write_json(self.project / "book.json", book)

    def unit(self, zh, en, lemma=None, **kwargs):
        value = dict(zh=zh, en=en, targets=[dict(lemma=lemma or en.lower(), surface=en)],
                     type="noun", meaning="本句的名词义", reviewed=True, priority=5)
        value.update(kwargs)
        return value

    def test_two_per_sentence_not_two_per_paragraph(self):
        b = self.project_for("书、花园和窗户。街道、房子和门。", "Book, garden and window. Street, house and door.")
        b["paragraphs"][0]["units"] = [self.unit(a,e) for a,e in [("书","Book"),("花园","garden"),("窗户","window"),("街道","Street"),("房子","house"),("门","door")]]
        self.save(b)
        r = nv.prepare(self.project)
        self.assertEqual(r["stats"]["replacements"],4)
        self.assertEqual(r["stats"]["cards"],6)
        counts = {}
        for c in r["cards"]:
            if c["selected"]: counts[c["sentence"]]=counts.get(c["sentence"],0)+1
        self.assertEqual(counts,{0:2,1:2})
        p=r["paragraphs"][0]
        self.assertEqual(''.join(s.get('zh',s.get('text','')) for s in p['segments']),p['zh'])

    def test_sentence_punctuation_quotes_and_commas(self):
        text='他说：“来！？！”她问：“书呢？”房门关着，窗户开着；风很冷。'
        spans=nv.sentence_spans(text)
        self.assertEqual(len(spans),3)
        self.assertEqual(text[spans[0][0]:spans[0][1]],'他说：“来！？！”')
        self.assertEqual(len(nv.sentence_spans('书，花园；窗户：门\n房子。')),1)

    def test_exact_english_source_and_paragraph_ids(self):
        b=self.project_for('她拿起书。','She picked up the book.',language='en')
        b['paragraphs'][0]['units']=[self.unit('书','book')]
        self.save(b)
        r=nv.prepare(self.project)
        self.assertEqual(r['paragraphs'][0]['en'],'She picked up the book.')
        b['paragraphs'][0]['en']='She took the book.'
        self.save(b)
        with self.assertRaisesRegex(nv.Invalid,'Original-language'): nv.prepare(self.project)

    def test_chinese_source_cannot_be_repunctuated_for_budget(self):
        b=self.project_for('书，花园。','Book and garden.')
        b['paragraphs'][0]['zh']='书。花园。'
        self.save(b)
        with self.assertRaisesRegex(nv.Invalid,'Original-language'): nv.prepare(self.project)

    def test_overlap_prefers_complete_phrase_and_counts_once(self):
        b=self.project_for('她玩篮球。','She plays basketball.')
        phrase=dict(zh='玩篮球',en='plays basketball',targets=[dict(lemma='play',surface='plays'),dict(lemma='basketball',surface='basketball')],type='verb_phrase',meaning='进行篮球运动',reviewed=True,priority=8)
        b['paragraphs'][0]['units']=[phrase,self.unit('篮球','basketball')]
        self.save(b)
        r=nv.prepare(self.project)
        self.assertEqual(r['stats']['replacements'],1)
        self.assertEqual(r['paragraphs'][0]['reading'],'她plays basketball（玩篮球）。')
        self.assertEqual(r['cards'][1]['selection_reason'],'overlap')

    def test_word_forms_reject_semantic_substitution_and_derivation(self):
        self.assertEqual(nv.form_relation('property','properties'),'inflection')
        self.assertEqual(nv.form_relation('run','ran'),'inflection')
        self.assertEqual(nv.form_relation('favour','favor'),'spelling')
        self.assertIsNone(nv.form_relation('aware','unaware'))
        self.assertIsNone(nv.form_relation('play','hit'))
        b=self.project_for('他击打球。','He hit the ball.')
        b['paragraphs'][0]['units']=[self.unit('击打','hit',lemma='play')]
        self.save(b)
        r=nv.prepare(self.project)
        self.assertEqual(r['stats']['cards'],0)
        self.assertIn('unverified_word_form',r['rejected'][0]['reason'])

    def test_translation_variant_prefers_contextual_fit_over_variety(self):
        candidates = [
            {'text': 'project', 'fit': 10},
            {'text': 'program', 'fit': 7},
            {'text': 'item', 'fit': 3},
        ]
        choice = nv.choose_translation_variant(candidates, {'project': 99}, 'chapter-1|p1|项目')
        self.assertEqual(choice['text'], 'project')
        self.assertEqual(choice['selection_reason'], 'semantic_best')

    def test_translation_variant_rotates_equal_candidates_and_is_reproducible(self):
        candidates = [{'text': word, 'fit': 10} for word in ('project', 'program', 'item')]
        used = {}
        choices = []
        for index in range(3):
            choice = nv.choose_translation_variant(candidates, used, f'book|chapter-1|p{index}|项目')
            choices.append(choice['text'])
            key = choice['text'].casefold()
            used[key] = used.get(key, 0) + 1
        self.assertEqual(set(choices), {'project', 'program', 'item'})
        first = nv.choose_translation_variant(candidates, {}, 'book|chapter-2|p1|项目')
        again = nv.choose_translation_variant(candidates, {}, 'book|chapter-2|p1|项目')
        self.assertEqual(first, again)

    def test_repeated_spans_need_explicit_occurrence(self):
        b=self.project_for('书在桌上。书在地上。','A book is on the table. A book is on the floor.')
        b['paragraphs'][0]['units']=[self.unit('书','book')]
        self.save(b)
        r=nv.prepare(self.project)
        self.assertEqual(r['stats']['cards'],0)
        self.assertIn('ambiguous',r['rejected'][0]['reason'])
        b['paragraphs'][0]['units'][0].update(zh_occurrence=1,en_occurrence=1)
        self.save(b)
        self.assertEqual(nv.prepare(self.project)['paragraphs'][0]['reading'],'书在桌上。book（书）在地上。')

    def test_cross_sentence_is_card_only(self):
        b=self.project_for('书在这里。花园在那里。','The book is here. The garden is there.')
        u=self.unit('书在这里。花园在那里','The book is here. The garden is there',lemma='book')
        u['targets']=[dict(lemma='book',surface='book')]
        b['paragraphs'][0]['units']=[u]
        self.save(b)
        r=nv.prepare(self.project)
        self.assertEqual(r['stats']['cards'],1)
        self.assertEqual(r['stats']['replacements'],0)
        self.assertEqual(r['cards'][0]['selection_reason'],'cross_sentence')

    def test_pending_does_not_look_complete(self):
        b=self.project_for('书在这里。','The book is here.')
        b['paragraphs'][0]['review_status']='pending'
        self.save(b)
        with self.assertRaisesRegex(nv.Invalid,'unreviewed'): nv.prepare(self.project)
        r=nv.prepare(self.project,allow_partial=True)
        self.assertEqual(r['stats']['status'],'partial')
        self.assertEqual(r['stats']['reviewed'],0)

    def test_bilingual_only_needs_no_vocabulary(self):
        b=self.project_for('她看书。','She reads a book.',language='en')
        b['config']['lexicons']={'missing':'does-not-exist.txt'}
        self.save(b)
        answer=nv.build(self.project,mode='bilingual')
        out=Path(answer['output'])
        self.assertTrue((out/'中英逐段对照.txt').exists())
        self.assertFalse((out/'英文回填阅读.txt').exists())
        self.assertIn('She reads a book.',(out/'English.txt').read_text(encoding='utf-8-sig'))

    def test_custom_lexicon_known_word_and_zero_budget(self):
        b=self.project_for('书和花园。','Book and garden.')
        (self.project/'mine.txt').write_text('book\ngarden\n',encoding='utf-8')
        b['config'].update(lexicons={'personal':'mine.txt'},known_words=['book'])
        b['paragraphs'][0]['units']=[self.unit('书','Book'),self.unit('花园','garden')]
        self.save(b)
        r=nv.prepare(self.project,max_per_sentence=0)
        self.assertEqual(r['stats']['cards'],1)
        self.assertEqual(r['stats']['replacements'],0)
        self.assertEqual(r['cards'][0]['targets'][0]['lexicons'],['personal'])

    def test_preinstalled_database_keeps_multi_labels_and_can_exclude_pep_basic_globally(self):
        src = self.root / 'database.txt'
        src.write_text('词库。', encoding='utf-8')
        nv.initialize(src, self.project, 'zh', pep_basic='keep')
        keep = nv.read_json(self.project / 'book.json')['config']
        lexicons, provenance = nv.load_lexicons(keep, self.project)
        self.assertIn('and', lexicons['四级'])
        self.assertIn('and', lexicons['人教版初中'])
        self.assertIn('and', lexicons['人教小学'])
        self.assertEqual(provenance[0]['count'], 22960)
        self.assertEqual(len(provenance[0]['selected']), 17)

        keep['excluded_lexicons'] = ['pep-junior', 'pep-primary']
        excluded, provenance = nv.load_lexicons(keep, self.project)
        self.assertFalse(any('and' in words for words in excluded.values()))
        self.assertEqual([x['id'] for x in provenance[0]['excluded']], ['pep-junior', 'pep-primary'])

    def test_initialization_records_the_pep_basic_decision(self):
        src = self.root / 'policy.txt'
        src.write_text('词库。', encoding='utf-8')
        nv.initialize(src, self.project, 'zh', pep_basic='exclude')
        config = nv.read_json(self.project / 'book.json')['config']
        self.assertEqual(config['pep_basic_policy'], 'exclude')
        self.assertEqual(config['excluded_lexicons'], ['pep-junior', 'pep-primary'])

    def test_unicode_offsets_html_safety_and_versioned_outputs(self):
        b=self.project_for('😀她看书。','😀 She reads a book. </script><script>bad()</script>')
        b['paragraphs'][0]['units']=[self.unit('书','book')]
        self.save(b)
        first=Path(nv.build(self.project)['output'])
        second=Path(nv.build(self.project)['output'])
        self.assertNotEqual(first,second)
        r=nv.read_json(first/'aligned.json');c=r['cards'][0]
        self.assertEqual(c['en_context'][c['en_start']:c['en_end']],'book')
        h=(first/'阅读.html').read_text(encoding='utf-8')
        self.assertNotIn('</script><script>bad()',h)
        self.assertIn('Array.from(c.en_context)',h)

    def test_snapshot_mutation_rejected(self):
        b=self.project_for('书。','Book.')
        self.save(b)
        manifest=nv.read_json(self.project/'source_manifest.json')
        (self.project/manifest['snapshot']).write_text('已改动',encoding='utf-8')
        with self.assertRaisesRegex(nv.Invalid,'snapshot changed'): nv.prepare(self.project)

    def test_compound_component_is_not_a_standalone_inflection(self):
        b=self.project_for('狭锋刀。','A narrow-bladed sword.')
        b['paragraphs'][0]['units']=[self.unit('狭锋刀','narrow-bladed sword',lemma='blade')]
        b['paragraphs'][0]['units'][0]['targets']=[dict(lemma='blade',surface='bladed')]
        self.save(b)
        r=nv.prepare(self.project)
        self.assertEqual(r['stats']['cards'],0)
        self.assertIn('surface_not_found',r['rejected'][0]['reason'])


if __name__=='__main__':
    unittest.main(verbosity=2)
