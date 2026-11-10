# 文件工作流与数据约定

脚本只使用 Python 3 标准库；由代理完成翻译、语义对齐和审校，脚本不调用模型也不联网。`<skill>` 是本技能目录，`<project>` 是本次书籍的独立工作目录。执行前探测可用 Python；Windows 的 python 命令若为商店占位符，使用本机已安装的真实解释器，不硬编码他人的用户路径。

## 初始化与段落

```text
python <skill>/scripts/novel_vocab.py init input.txt --project <project> --language zh --split line --pep-basic exclude
python <skill>/scripts/novel_vocab.py init original-en.txt --project <project> --language en --split blank --pep-basic keep
```

先检查文件段落格式。`line` 把非空行当段，适合一行一段的中文小说；`blank` 按空行分段，保留段内换行，适合硬换行的英文文本。不能将版面自动换行当自然段。默认UTF-8，可显式指定 `--encoding gb18030` 等；解码失败就确认编码。PDF、EPUB、DOCX 先用可用的专用提取工具得到有段落标记的文本；保留输入原件并核对抽样段落。

项目包含原件字节副本、`source_manifest.json` 和可编辑的 `book.json`。源语言段落与 manifest 的内容一致；填充另一语言和 units。不要改 manifest 来绕过源文校验。章标题／元数据设置 `kind` 为 `heading`／`metadata`，翻译保留，但不回填。

已有独立中英文译本时选定一种为源，按它的自然段初始化，把另一版语义相应的内容放入同ID字段。无法一对一的多对多组先在单独对齐记录里保留两边原段编号与组内顺序，再按确认的组建立项目；不要把缺漏、版本不同的段落强配。

## book.json 示例

以下仅为结构示例；示例句是自编文本。`source` 与源语言字段须保持初始化时的确切字符串。

```json
{
  "schema_version": 1,
  "title": "示例",
  "source_language": "zh",
  "config": {
    "max_per_sentence": 2,
    "density_mode": "adaptive",
    "density_han_chars_per_unit": 32,
    "density_english_words_per_unit": 20,
    "mode": "both",
    "lexicon_database": "bundled:current",
    "lexicon_lists": ["gmat", "gre", "sat", "tem8", "tem4", "pep-high", "cet6", "cet4", "business", "fltrp-junior", "toefl", "postgrad", "ielts", "highschool", "pep-junior", "pep-primary", "toeic"],
    "excluded_lexicons": ["pep-junior", "pep-primary"],
    "pep_basic_policy": "exclude",
    "known_words": []
  },
  "paragraphs": [{
    "id": "p00001",
    "source": "她拿起书，走进花园。",
    "zh": "她拿起书，走进花园。",
    "en": "She picked up the book and walked into the garden.",
    "kind": "body",
    "review_status": "reviewed",
    "issues": [],
    "units": [{
      "id": "p00001-book",
      "zh": "书",
      "en": "book",
      "targets": [{"lemma": "book", "surface": "book"}],
      "type": "noun",
      "meaning": "供阅读的书籍",
      "pattern": "a book / the book",
      "note": "本句为单数；保留实际词形。",
      "priority": 6,
      "reviewed": true,
      "backfill": true
    }]
  }],
  "terminology": [],
  "review_notes": []
}
```

`review_status`：`pending`、`reviewed`、`reviewed_with_issues`。后者需要在 `issues` 写明问题、处理及影响；内容有疑点的范围不生成可靠学习单元。长篇待处理段保持pending，不能批量标审校完成。

`units` 中英文必须是对应段里的精确连续子串。出现多次时显式给 `zh_occurrence`／`en_occurrence`（从0计），或 `zh_start`／`en_start`（Unicode码点索引，从0计）；脚本拒绝含糊定位。导出的end不含末位。拼接、同义改写或跨段内容不能冒充英文精确抽取；只把可定位的完整单元送给脚本，复杂对应写入普通审校说明。

`targets` 可以多个，但每个 `surface` 必须在该英文单元内，`lemma` 必须真实命中选定词表且形态关系可核验。`meaning` 记录本句义，不只抄词典首义。`pattern` 可以是词典化结构，`en` 则必须保留原句形式。

翻译阶段另维护章内 `translation_variant_ledger`（可放在工作记录，不要求进入最终 `book.json`）。每条至少包含：`chapter_id`、`source_key`（规范化中文 + 词性 + 本句义）、`candidates`、各候选的语境适配分、`selected`、`selection_reason` 和稳定种子材料。适配分由代理根据语境、搭配、语域、语法和术语一致性给出；脚本不得猜测语义。需要在等分候选中决胜时，可将候选写成 `[{"text":"project","fit":10},{"text":"program","fit":10}]`，并把本章该义项已用次数与稳定种子传给 `choose_translation_variant`。函数先保留最高 `fit`，再选最少使用项，最后仅在仍并列时稳定伪随机；章切换时清空次数。原版或已生成书籍不会因更新本规则而自动重译，只有新建或用户明确要求重做的范围才应用。

`type` 取 `noun`、`adjective_noun`、`verb_phrase`、`idiom`、`relative_clause`、`participle`、`infinitive`、`clause`、`other`。例如 `money to be made` 为infinitive，不是relative_clause。

`priority` 为0–10，默认5；优先实用表达，质量相当时普通名词优先，随后按中文出现顺序选取。`backfill:false` 将合格项保留在卡片中。跨中文句项保留卡片不回填；重叠项择优，同句重复词元不重复占位。没有词表命中的候选记录在 `rejected-units.json`，不偷偷改成“雅思候选”混入正式结果。

`density_mode` 默认 `adaptive`。此时每个正文段的建议候选数为 `ceil(max(汉字数 / density_han_chars_per_unit, 英文词数 / density_english_words_per_unit))`，再封顶到 `中文句数 × max_per_sentence`；标题和元数据目标为0。默认分母为32个汉字、20个英文词。目标用于指导模型补充可靠候选并生成密度统计，不会让脚本自动制造语义对齐。`density_mode: "off"` 关闭该统计；用户指定其他密度时把分母写入配置，不靠临时提示记忆。

`lexicon_lists` 是从预装数据库选取的标签并集。`excluded_lexicons` 是全局减法：词条命中任一排除标签时，即使还命中其他选中标签，也从本次抽取中剔除。初始化前必须确认是否剔除人教版初中和人教小学；用 `--pep-basic keep` 或 `--pep-basic exclude` 记录，不根据年龄擅自推断。

自定义旧式文本词表仍兼容：在config中删除 `lexicon_database`、`lexicon_lists` 与 `excluded_lexicons`，改写 `"lexicons": {"个人词表": "my-words.txt"}`；相对项目目录解释。已掌握词以词元加入known_words，明确这会排除该词元的各义项；用户只掌握某一义项时改为人工筛选相关单元，不扩大排除范围。

## 校验与导出

```text
python <skill>/scripts/novel_vocab.py validate --project <project>
python <skill>/scripts/novel_vocab.py build --project <project>
python <skill>/scripts/novel_vocab.py build --project <project> --mode bilingual
python <skill>/scripts/novel_vocab.py build --project <project> --max-per-sentence 1
```

默认mode=both。仅双语模式不要求词库和学习单元；backfill模式仍保留纯中英文以便核验。若用户明确要阶段预览，加 `--allow-partial`；未完成段在输出标记，不能把该报告当全书完成。

每次构建使用新目录 `output`、`output-002` 等，保留旧版本。包含：

- `阅读.html`：离线切换中文、英文、中英对照、回填、学习卡和审校。
- `中文.txt`、`English.txt`、`中英逐段对照.txt`（相应模式）。
- `英文回填阅读.txt`（相应模式）、`学习卡.csv`。
- `aligned.json`：稳定ID、完整两种语言、学习单元、跨度和选择原因。
- `审校记录.txt`、`validation.json`、`rejected-units.json`。

修改密度、词库或候选后重新构建，语义未改时无需重译。`validation.json` 会给出 `density_target`、`density_shortfall` 和缺口段落编号；缺口不是结构错误，但交付时应说明是可靠候选不足还是尚未补齐。修改译文后重查所有英文片段位置、语境和词形；脚本校验不替代此审校。最终核验源语原样、逐段覆盖、句内限额和中文还原；界面是否实际打开验收另行说明。
