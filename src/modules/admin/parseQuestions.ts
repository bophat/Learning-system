/**
 * Đọc file đề thi do quản trị viên tải lên và chuẩn hoá về đúng dạng của bảng
 * `questions`. Chấp nhận vài định dạng hay gặp để khỏi phải sửa file thủ công:
 *
 *  • JSON dạng rút gọn  : { n, en, ja, opts: [{ l, en, ja }], ans, multi }
 *  • JSON dạng đầy đủ   : { n, stem_en, stem_ja, options: [{ label, en, ja }], answer, multi, domain }
 *  • JSON câu tự luận   : { n, kind: "essay", title, prompt, subQuestions: [{ id, prompt, referenceAnswer }] }
 *  • CSV                : n,en,ja,A,B,C,D,answer,multi,domain  (dòng đầu là tiêu đề)
 */

export interface QuestionRowInput {
  module_id: string;
  stage_id: string;
  n: number;
  kind: "mc" | "essay";
  stem_en?: string | null;
  stem_ja?: string | null;
  options?: { label: string; en: string; ja: string }[];
  answer?: string | null;
  multi?: boolean;
  domain?: string | null;
  title?: string | null;
  prompt?: string | null;
  sub_questions?: { id: string; prompt: string; referenceAnswer: string }[];
  required?: boolean;
}

export interface ParseResult {
  rows: QuestionRowInput[];
  errors: string[];
  warnings: string[];
}

/** Tách CSV có xử lý dấu ngoặc kép và dấu phẩy bên trong ô. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function truthy(v: unknown): boolean {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "x" || s === "có";
}

function fromCsv(text: string, moduleId: string, stageId: string): ParseResult {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) return { rows: [], errors: ["File CSV không có dòng dữ liệu nào."], warnings: [] };

  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names: string[]) => {
    for (const name of names) {
      const i = head.indexOf(name);
      if (i >= 0) return i;
    }
    return -1;
  };

  const iN = col("n", "stt", "số câu", "no");
  const iEn = col("en", "question", "đề bài", "stem", "stem_en");
  const iJa = col("ja", "stem_ja", "tiếng nhật");
  const iAns = col("answer", "ans", "đáp án", "correct");
  const iMulti = col("multi", "chọn nhiều");
  const iDomain = col("domain", "chủ đề", "topic");
  const letters = ["a", "b", "c", "d", "e", "f"];
  const optCols = letters.map((l) => col(l, `option${l}`, `opt_${l}`, `lựa chọn ${l}`));

  if (iEn < 0) errors.push('Thiếu cột đề bài (đặt tên cột là "en" hoặc "question").');
  if (iAns < 0) errors.push('Thiếu cột đáp án (đặt tên cột là "answer").');
  if (optCols.every((i) => i < 0)) errors.push('Thiếu cột lựa chọn (đặt tên các cột là "A", "B", "C", "D").');
  if (errors.length) return { rows: [], errors, warnings: [] };

  const rows: QuestionRowInput[] = [];
  table.slice(1).forEach((r, idx) => {
    const options = optCols
      .map((ci, li) => (ci >= 0 && (r[ci] ?? "").trim() ? { label: letters[li].toUpperCase(), en: r[ci].trim(), ja: "" } : null))
      .filter((o): o is { label: string; en: string; ja: string } => !!o);

    rows.push({
      module_id: moduleId,
      stage_id: stageId,
      kind: "mc",
      n: iN >= 0 ? Number(r[iN]) || idx + 1 : idx + 1,
      stem_en: (r[iEn] ?? "").trim(),
      stem_ja: iJa >= 0 ? (r[iJa] ?? "").trim() : "",
      options,
      answer: (r[iAns] ?? "").trim().toUpperCase().replace(/[^A-F]/g, "") || null,
      multi: iMulti >= 0 ? truthy(r[iMulti]) : ((r[iAns] ?? "").replace(/[^A-Fa-f]/g, "").length > 1),
      domain: iDomain >= 0 ? (r[iDomain] ?? "").trim() || null : null,
    });
  });

  return { rows, errors: [], warnings: [] };
}

function fromJson(raw: unknown, moduleId: string, stageId: string): ParseResult {
  if (!Array.isArray(raw)) {
    return { rows: [], errors: ["File JSON phải là một mảng các câu hỏi."], warnings: [] };
  }

  const rows: QuestionRowInput[] = raw.map((q: Record<string, unknown>, idx: number) => {
    const kind = q.kind === "essay" ? "essay" : "mc";
    const n = Number(q.n ?? idx + 1);

    if (kind === "essay") {
      const subs = (q.subQuestions ?? q.sub_questions ?? []) as { id: string; prompt: string; referenceAnswer: string }[];
      return {
        module_id: moduleId,
        stage_id: (q.stage_id as string) ?? stageId,
        kind,
        n,
        title: (q.title as string) ?? `Câu ${n}`,
        prompt: (q.prompt as string) ?? "",
        sub_questions: Array.isArray(subs) ? subs : [],
        required: !!q.required,
      };
    }

    const rawOpts = (q.options ?? q.opts ?? []) as Record<string, string>[];
    const options = (Array.isArray(rawOpts) ? rawOpts : []).map((o, i) => ({
      label: String(o.label ?? o.l ?? String.fromCharCode(65 + i)),
      en: String(o.en ?? o.text ?? ""),
      ja: String(o.ja ?? ""),
    }));

    return {
      module_id: moduleId,
      stage_id: (q.stage_id as string) ?? stageId,
      kind,
      n,
      stem_en: String(q.stem_en ?? q.en ?? q.question ?? ""),
      stem_ja: String(q.stem_ja ?? q.ja ?? ""),
      options,
      answer: (q.answer ?? q.ans ?? null) as string | null,
      multi: !!(q.multi ?? String(q.answer ?? q.ans ?? "").length > 1),
      domain: (q.domain as string) ?? null,
    };
  });

  return { rows, errors: [], warnings: [] };
}

/** Kiểm tra dữ liệu trước khi cho phép đẩy lên máy chủ. */
function validate(rows: QuestionRowInput[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  rows.forEach((r, i) => {
    const where = `Câu thứ ${i + 1}${Number.isFinite(r.n) ? ` (n=${r.n})` : ""}`;

    if (!Number.isFinite(r.n) || r.n <= 0) errors.push(`${where}: số hiệu câu không hợp lệ.`);
    const key = `${r.stage_id}:${r.n}`;
    if (seen.has(key)) errors.push(`${where}: trùng số hiệu câu trong cùng một chặng.`);
    seen.add(key);

    if (r.kind === "essay") {
      if (!r.prompt?.trim()) errors.push(`${where}: câu tự luận thiếu đề bài.`);
      if (!r.sub_questions?.length) warnings.push(`${where}: câu tự luận không có câu hỏi con nào.`);
      return;
    }

    if (!r.stem_en?.trim()) errors.push(`${where}: thiếu nội dung đề bài.`);
    if (!r.options?.length) {
      errors.push(`${where}: không có phương án nào.`);
      return;
    }
    if (r.options.length < 2) errors.push(`${where}: cần ít nhất 2 phương án.`);

    const labels = new Set(r.options.map((o) => o.label.toUpperCase()));
    if (!r.answer) {
      warnings.push(`${where}: chưa có đáp án — câu này chỉ xem được, không đưa vào bài làm.`);
      return;
    }
    for (const ch of r.answer.toUpperCase()) {
      if (!labels.has(ch)) errors.push(`${where}: đáp án "${ch}" không khớp phương án nào.`);
    }
  });

  return { errors, warnings };
}

/** Điểm vào chính: nhận nội dung file và tên file, trả về dữ liệu đã chuẩn hoá. */
export function parseQuestionFile(text: string, fileName: string, moduleId: string, stageId: string): ParseResult {
  let base: ParseResult;
  const isCsv = /\.csv$/i.test(fileName) || (!text.trim().startsWith("[") && !text.trim().startsWith("{"));

  if (isCsv) {
    base = fromCsv(text, moduleId, stageId);
  } else {
    try {
      base = fromJson(JSON.parse(text), moduleId, stageId);
    } catch (err) {
      return {
        rows: [],
        errors: [`File JSON không đọc được: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      };
    }
  }

  if (base.errors.length) return base;
  const check = validate(base.rows);
  return { rows: base.rows, errors: check.errors, warnings: [...base.warnings, ...check.warnings] };
}
