export interface GradeCsvRow {
  credentialId: string;
  subjectHash: string;
  courseHash: string;
  courseName: string;
  score: number;
  grade: string;
  schemaVersion: string;
  salt: string;
}

const headers: Array<keyof GradeCsvRow> = [
  'credentialId',
  'subjectHash',
  'courseHash',
  'courseName',
  'score',
  'grade',
  'schemaVersion',
  'salt',
];

export const gradeCsvHeader = headers.join(',');

export function parseGradeCsv(source: string): GradeCsvRow[] {
  const table = parseCsvTable(source.replace(/^\uFEFF/, ''));
  if (table.length < 2) throw new Error('CSV 至少需要表头和一行成绩数据');
  const actualHeaders = table[0]?.map((value) => value.trim()) ?? [];
  if (
    actualHeaders.length !== headers.length ||
    headers.some((header, index) => actualHeaders[index] !== header)
  ) {
    throw new Error(`CSV 表头必须严格为：${gradeCsvHeader}`);
  }

  return table.slice(1).map((cells, index) => {
    const line = index + 2;
    if (cells.length !== headers.length)
      throw new Error(`第 ${line} 行应有 ${headers.length} 列，实际为 ${cells.length} 列`);
    const values = cells.map((value) => value.trim());
    const scoreText = values[4] ?? '';
    const score = scoreText === '' ? Number.NaN : Number(scoreText);
    if (!Number.isFinite(score)) throw new Error(`第 ${line} 行 score 必须是数字`);
    return {
      credentialId: values[0] ?? '',
      subjectHash: values[1] ?? '',
      courseHash: values[2] ?? '',
      courseName: values[3] ?? '',
      score,
      grade: values[5] ?? '',
      schemaVersion: values[6] ?? '',
      salt: values[7] ?? '',
    };
  });
}

export function validateGradeCsvRows(rows: GradeCsvRow[]): string[] {
  if (rows.length < 1 || rows.length > 50) return ['CSV 每批必须包含 1–50 条成绩'];
  const errors: string[] = [];
  const seen = new Set<string>();
  const identifierPattern = /^[A-Za-z0-9:_-]{8,128}$/;
  const hashPattern = /^[a-f0-9]{64}$/;
  rows.forEach((row, index) => {
    const line = index + 2;
    if (!identifierPattern.test(row.credentialId))
      errors.push(`第 ${line} 行：credentialId 格式无效`);
    else if (seen.has(row.credentialId)) errors.push(`第 ${line} 行：credentialId 在批内重复`);
    seen.add(row.credentialId);
    if (!hashPattern.test(row.subjectHash))
      errors.push(`第 ${line} 行：subjectHash 必须是 64 位小写 SHA-256`);
    if (!hashPattern.test(row.courseHash))
      errors.push(`第 ${line} 行：courseHash 必须是 64 位小写 SHA-256`);
    if (!row.courseName || row.courseName.length > 200)
      errors.push(`第 ${line} 行：courseName 长度必须为 1–200`);
    if (!Number.isFinite(row.score) || row.score < 0 || row.score > 100)
      errors.push(`第 ${line} 行：score 必须为 0–100`);
    if (!row.grade || row.grade.length > 16) errors.push(`第 ${line} 行：grade 长度必须为 1–16`);
    if (!/^\d+\.\d+$/.test(row.schemaVersion))
      errors.push(`第 ${line} 行：schemaVersion 必须使用 major.minor 格式`);
    if (row.salt.length < 16 || row.salt.length > 256)
      errors.push(`第 ${line} 行：salt 长度必须为 16–256`);
  });
  return errors;
}

function parseCsvTable(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let quoteClosed = false;
  let line = 1;

  const pushRow = () => {
    row.push(cell);
    if (row.some((value) => value.trim() !== '')) rows.push(row);
    row = [];
    cell = '';
    quoteClosed = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] ?? '';
    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          quoteClosed = true;
        }
      } else {
        cell += character;
        if (character === '\n') line += 1;
      }
      continue;
    }

    if (character === '"') {
      if (cell.length > 0 || quoteClosed) throw new Error(`第 ${line} 行引号位置无效`);
      inQuotes = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
      quoteClosed = false;
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      pushRow();
      line += 1;
    } else if (quoteClosed) {
      if (!/\s/.test(character)) throw new Error(`第 ${line} 行闭合引号后存在非法字符`);
    } else {
      cell += character;
    }
  }
  if (inQuotes) throw new Error(`第 ${line} 行存在未闭合引号`);
  if (cell.length > 0 || row.length > 0) pushRow();
  return rows;
}
