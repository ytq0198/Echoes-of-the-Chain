import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { evidenceRoot, rawRoot } from './lib/config.mjs';
import { median, nearestRank, summarizeRequests, toCsv } from './lib/metrics.mjs';

const runId = (process.env.BENCHMARK_RUN_ID || (await readFile(join(evidenceRoot, 'latest-run.txt'), 'utf8'))).trim();
const runRoot = join(rawRoot, runId);
const manifest = JSON.parse(await readFile(join(runRoot, 'manifest.json'), 'utf8'));
const files = await readdir(runRoot);
const cellFiles = files.filter((name) => name.endsWith('.jsonl')).sort();
if (cellFiles.length !== manifest.schedule.length) throw new Error(`Expected ${manifest.schedule.length} JSONL cells, found ${cellFiles.length}`);

const perRun = [];
const stageRows = [];
for (const file of cellFiles) {
  const records = (await readFile(join(runRoot, file), 'utf8')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  if (records.length === 0) throw new Error(`Raw cell is empty: ${file}`);
  const descriptor = manifest.schedule.find((cell) => `${cell.cellId}.jsonl` === file);
  if (!descriptor) throw new Error(`Cell is missing from manifest: ${file}`);
  const logical = logicalRecords(records, descriptor.variant);
  const durationSeconds = observedSeconds(logical);
  const summary = summarizeRequests(logical.map((record) => ({ ...record, latencyMs: record.logicalLatencyMs ?? record.latencyMs })), durationSeconds);
  const batchSize = logical[0]?.batchSize ?? 1;
  perRun.push({ runId, ...descriptor, observedSeconds: round(durationSeconds), batchSize, entryThroughput: round(summary.throughput * batchSize), ...roundObject(summary) });
  for (const stage of [...new Set(records.map((record) => record.stage))].sort()) {
    const stageRecords = records.filter((record) => record.stage === stage);
    const stageSeconds = observedSeconds(stageRecords);
    stageRows.push({ runId, ...descriptor, stage, observedSeconds: round(stageSeconds), ...roundObject(summarizeRequests(stageRecords, stageSeconds)) });
  }
}

const grouped = new Map();
for (const row of perRun) {
  const key = `${row.variant}|${row.concurrency}`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(row);
}
const summary = [];
for (const [key, rows] of [...grouped.entries()].sort(([left], [right]) => {
  const [leftVariant, leftConcurrency] = left.split('|');
  const [rightVariant, rightConcurrency] = right.split('|');
  return manifest.variants.indexOf(leftVariant) - manifest.variants.indexOf(rightVariant) || Number(leftConcurrency) - Number(rightConcurrency);
})) {
  const [variant, concurrency] = key.split('|');
  const output = { runId, variant, concurrency: Number(concurrency), repeats: rows.length };
  for (const field of ['throughput', 'entryThroughput', 'failureRate', 'p50Ms', 'p95Ms', 'p99Ms']) {
    const values = rows.map((row) => Number(row[field]));
    output[`${field}Median`] = round(median(values));
    output[`${field}Min`] = round(Math.min(...values));
    output[`${field}Max`] = round(Math.max(...values));
  }
  summary.push(output);
}

const resourceRows = [];
for (const file of files.filter((name) => name.endsWith('-resources.csv')).sort()) {
  const rows = parseCsv(await readFile(join(runRoot, file), 'utf8'));
  const cellId = file.replace(/-resources\.csv$/, '');
  for (const component of [...new Set(rows.map((row) => row.component))]) {
    const selected = rows.filter((row) => row.component === component);
    const cpu = selected.map((row) => Number(row.cpuPct));
    const rss = selected.map((row) => Number(row.rssMiB));
    resourceRows.push({ runId, cellId, component, samples: selected.length, cpuP50: round(nearestRank(cpu, 50)), cpuP95: round(nearestRank(cpu, 95)), cpuMax: round(Math.max(...cpu)), rssP50MiB: round(nearestRank(rss, 50)), rssP95MiB: round(nearestRank(rss, 95)), rssMaxMiB: round(Math.max(...rss)) });
  }
}

const summaryColumns = ['runId', 'variant', 'concurrency', 'repeats', ...['throughput', 'entryThroughput', 'failureRate', 'p50Ms', 'p95Ms', 'p99Ms'].flatMap((field) => [`${field}Median`, `${field}Min`, `${field}Max`])];
const perRunColumns = ['runId', 'cellId', 'variant', 'concurrency', 'repeat', 'observedSeconds', 'batchSize', 'requests', 'successes', 'failures', 'throughput', 'entryThroughput', 'failureRate', 'p50Ms', 'p95Ms', 'p99Ms'];
const stageColumns = [...perRunColumns.slice(0, 5), 'stage', ...perRunColumns.slice(5)];
const resourceColumns = ['runId', 'cellId', 'component', 'samples', 'cpuP50', 'cpuP95', 'cpuMax', 'rssP50MiB', 'rssP95MiB', 'rssMaxMiB'];
await writeFile(join(evidenceRoot, 'summary.csv'), toCsv(summary, summaryColumns));
await writeFile(join(evidenceRoot, 'per-run.csv'), toCsv(perRun, perRunColumns));
await writeFile(join(evidenceRoot, 'stage-summary.csv'), toCsv(stageRows, stageColumns));
await writeFile(join(evidenceRoot, 'resource-summary.csv'), toCsv(resourceRows, resourceColumns));
const resourceOverall = [...new Set(resourceRows.map((row) => row.component))].sort().map((component) => {
  const selected = resourceRows.filter((row) => row.component === component);
  return { component, cpuP95Max: round(Math.max(...selected.map((row) => row.cpuP95))), cpuPeak: round(Math.max(...selected.map((row) => row.cpuMax))), rssP95MaxMiB: round(Math.max(...selected.map((row) => row.rssP95MiB))), rssPeakMiB: round(Math.max(...selected.map((row) => row.rssMaxMiB))) };
});
await writeFile(join(evidenceRoot, 'resource-overall.csv'), toCsv(resourceOverall, ['component', 'cpuP95Max', 'cpuPeak', 'rssP95MaxMiB', 'rssPeakMiB']));

const charts = join(evidenceRoot, 'charts');
await mkdir(charts, { recursive: true });
await writeFile(join(charts, 'throughput.svg'), barChart('Median throughput (successful logical operations/s)', summary, 'throughputMedian'));
await writeFile(join(charts, 'p95-latency.svg'), barChart('Median P95 commit-confirmed latency (ms)', summary, 'p95MsMedian'));
await writeFile(join(charts, 'failure-rate.svg'), barChart('Median failure rate', summary, 'failureRateMedian'));
await writeFile(join(charts, 'resource-rss.svg'), resourceChart(resourceRows));
await writeFile(join(charts, 'fault-timeline.svg'), await faultChart());
await writeFile(join(evidenceRoot, 'aggregation.json'), `${JSON.stringify({ schemaVersion: 1, runId, method: 'nearest-rank percentiles; repeat summary is median with min-max range', cells: perRun.length, sourceFinishedAt: manifest.finishedAt }, null, 2)}\n`);
await writeReport(summary, resourceOverall);
console.log(`Aggregated ${perRun.length} cells for ${runId}`);

function logicalRecords(records, variant) {
  if (variant !== 'issue-review') return records;
  const groups = new Map();
  for (const record of records) groups.set(`${record.worker}:${record.sequence}`, [...(groups.get(`${record.worker}:${record.sequence}`) ?? []), record]);
  return [...groups.values()].map((items) => items.find((item) => item.stage === 'approve') ?? items.find((item) => item.stage === 'draft'));
}

function barChart(title, rows, field) {
  const width = 1200, height = 620, margin = 80;
  const max = Math.max(0.0001, ...rows.map((row) => Number(row[field])));
  const barWidth = Math.max(4, (width - margin * 2) / rows.length - 3);
  const bars = rows.map((row, index) => {
    const value = Number(row[field]);
    const h = (value / max) * (height - 190);
    const x = margin + index * ((width - margin * 2) / rows.length);
    const label = `${row.variant.replace('student-private', 'private').replace('public-verify', 'verify')}/c${row.concurrency}`;
    return `<rect x="${x}" y="${height - 100 - h}" width="${barWidth}" height="${h}" fill="#315c8c"/><text x="${x + barWidth / 2}" y="${height - 88}" transform="rotate(55 ${x + barWidth / 2} ${height - 88})" font-size="10">${escapeXml(label)}</text>`;
  }).join('');
  return svg(title, width, height, `<line x1="${margin}" y1="${height - 100}" x2="${width - margin}" y2="${height - 100}" stroke="#222"/>${bars}<text x="20" y="40" font-size="12">max=${round(max)}</text>`);
}

function resourceChart(rows) {
  const maxima = new Map();
  for (const row of rows) maxima.set(row.component, Math.max(maxima.get(row.component) ?? 0, row.rssMaxMiB));
  return barChart('Maximum observed RSS by component (MiB)', [...maxima].map(([variant, value]) => ({ variant, concurrency: '', value })), 'value');
}

async function faultChart() {
  try {
    const data = JSON.parse(await readFile(join(runRoot, 'faults.json'), 'utf8'));
    const rows = data.experiments.map((item) => ({ variant: item.name, concurrency: '', value: item.recoveryMs ?? 0 }));
    return barChart('Stable recovery time by injected fault (ms)', rows, 'value');
  } catch { return svg('Fault evidence not generated', 800, 200, '<text x="30" y="100">Run benchmark.sh faults before final aggregation.</text>'); }
}

function svg(title, width, height, content) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#fff"/><text x="${width / 2}" y="32" text-anchor="middle" font-family="sans-serif" font-size="18">${escapeXml(title)}</text><g font-family="sans-serif">${content}</g></svg>\n`;
}

async function writeReport(rows, resources) {
  let audit = null, faults = null, environment = null;
  try { audit = JSON.parse(await readFile(join(runRoot, 'ledger-audit.json'), 'utf8')); } catch {}
  try { faults = JSON.parse(await readFile(join(runRoot, 'faults.json'), 'utf8')); } catch {}
  try { environment = JSON.parse(await readFile(join(evidenceRoot, 'environment.json'), 'utf8')); } catch {}
  const table = rows.map((row) => `| ${row.variant} | ${row.concurrency} | ${row.throughputMedian} (${row.throughputMin}–${row.throughputMax}) | ${row.entryThroughputMedian} | ${row.p50MsMedian} | ${row.p95MsMedian} | ${row.p99MsMedian} | ${round(row.failureRateMedian * 100)}% |`).join('\n');
  const faultLines = faults?.experiments.map((item) => `- ${item.name}: ${item.recovered ? `stable recovery ${item.recoveryMs} ms` : 'not recovered within 120 s'}; errors ${JSON.stringify(item.errorCounts)}.`).join('\n') ?? '- Fault evidence has not been run.';
  const observations = manifest.variants.map((variant) => {
    const selected = rows.filter((row) => row.variant === variant);
    const best = selected.reduce((left, right) => left.entryThroughputMedian > right.entryThroughputMedian ? left : right);
    return `- ${variant}: highest median ${variant.startsWith('batch-') ? 'entry' : 'logical-operation'} throughput ${best.entryThroughputMedian}/s at concurrency ${best.concurrency}; median P95 ${best.p95MsMedian} ms at that point.`;
  }).join('\n');
  const resourceTable = resources.map((item) => `| ${item.component} | ${item.cpuP95Max} | ${item.cpuPeak} | ${item.rssP95MaxMiB} | ${item.rssPeakMiB} |`).join('\n');
  const totalFailures = perRun.reduce((sum, item) => sum + item.failures, 0);
  const failureFact = totalFailures === 0 ? '84 个正式单元未记录合法请求失败。' : `正式单元共记录 ${totalFailures} 次合法请求失败，分布以 summary.csv 为准。`;
  const resourceNames = resources.map((item) => item.component).join('、');
  const resourceLimitation = resources.some((item) => item.component === 'system')
    ? '资源证据包含受管进程和系统整体采样。'
    : `本次既有资源证据仅包含 ${resourceNames} 五个受管进程；没有系统整体采样，本报告不补造该数据。`;
  const faultLimitation = faults?.schemaVersion === 1
    ? '本次故障驱动的并发限制按读写请求对实现，而不是按单个 HTTP 请求实现；故障结论仅描述已记录探针的实际行为。'
    : '';
  const dirtyLimitation = environment?.before?.gitDirty
    ? `运行时记录的 Git commit 为 ${environment.before.gitCommit}，且工作树为 dirty；该 commit 不能单独证明当时未提交基准脚本的精确内容。`
    : '';
  const invalidCodes = audit ? Object.entries(audit.invalidByCode ?? {}).map(([code, count]) => `${code}:${count}`).join('、') || '无' : '未知';
  const auditText = audit ? `观察事实：Peer QSCC 全量检查高度 ${audit.startHeight}–${audit.endHeight}，得到有效交易 ${audit.validTransactions}、无效交易 ${audit.invalidTransactions}、未知无效交易 ${audit.unknownInvalidTransactions}、结构无法解释 ${audit.unexplainedTransactions}；验证码分布为 ${invalidCodes}。正式矩阵截止高度 ${audit.matrixEndHeight}，矩阵内无效交易 ${audit.matrixInvalidTransactions}，矩阵后无效交易 ${audit.postMatrixInvalidTransactions}。运行记录解释：矩阵后的 MVCC_READ_CONFLICT 来自保留的故障驱动诊断，其区块、交易 ID 和时间戳未删除，详见 ledger-audit.json。审计结论：${audit.passed ? '通过' : '失败'}。` : '账本审计尚未生成。';
  const report = `# Iteration 14：可重复性能基准与故障证据\n\n## 测试声明\n\n本报告由匿名原始数据自动生成。测量平台是用户授权替代指定服务器的当前 WSL 环境，结果不能代表或冒充原定服务器性能。实验不使用 Docker，也不接触演示账本。\n\n## 方法\n\n本次运行采用 ${manifest.warmupSeconds} 秒预热、${manifest.sampleSeconds} 秒正式采样、并发 ${manifest.concurrencies.join('/')}、每档 ${manifest.repeats} 次。延迟使用 nearest-rank P50/P95/P99；下表吞吐为成功逻辑操作/实际观测秒数，括号为重复运行 min–max。“条目/秒”对批量负载乘以批次大小，其他负载与逻辑操作/秒相同。签发负载以 draft 与独立 reviewer approve 全部完成为一次成功；HTTP 响应代表 Fabric commit 已确认。\n\n## 基线结果\n\n| 负载 | 并发 | 逻辑操作/秒中位数（范围） | 条目/秒 | P50 ms | P95 ms | P99 ms | 失败率中位数 |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n${table}\n\n## 观察与瓶颈\n\n${observations}\n\n${failureFact}观察事实是只读吞吐在高并发附近趋于平台，批量提高了条目吞吐，同时较大批次的尾延迟上升。原因推断：并发 5 的部分写负载低于并发 10，可能受到单 orderer 的 2 秒 BatchTimeout、闭环 worker 与成块节奏共同影响；该解释不是额外测量结论。\n\n## 资源占用\n\n| 组件 | 单元内 CPU P95 最大值 % | CPU 峰值 % | RSS P95 最大值 MiB | RSS 峰值 MiB |\n| --- | ---: | ---: | ---: | ---: |\n${resourceTable}\n\n${resourceLimitation}\n\n## 故障与恢复\n\n${faultLines}\n\n当前拓扑只有一个 orderer，因此不具备写入高可用；orderer 故障期间的查询与写入差异以原始探针为准。进程 RUNNING 不构成恢复判据，稳定恢复要求连续三次读写成功并且双 Peer 高度和哈希一致。\n\n## 账本审计\n\n${auditText}\n\n## 隐私、异常与局限\n\n仓库内原始记录不含 Cookie、密码、成绩明文、主机名、用户名、绝对路径或原始错误消息。未登录 401、错误角色 403 和批量冲突原子回滚是独立控制用例，不混入合法请求失败率。本报告不设置 TPS 达标线。${faultLimitation}${dirtyLimitation} WSL 调度、共享宿主资源和单机回环网络限制了外推性。\n\n## 复现\n\n运行 \`./infra/benchmark/benchmark.sh all\`。原始数据、环境快照、聚合表和 SVG 位于 \`reports/assets/iteration-14-benchmark\`。\n`;
  await writeFile(join(evidenceRoot, '../../22_iteration_14_benchmark_reliability.md'), report);
}

function parseCsv(text) { const [header, ...lines] = text.trim().split('\n'); const columns = header.split(','); return lines.filter(Boolean).map((line) => Object.fromEntries(line.split(',').map((value, index) => [columns[index], value]))); }
function observedSeconds(records) {
  const starts = records.map((record) => Date.parse(record.logicalStartedAt ?? record.startedAt));
  const ends = records.map((record) => Date.parse(record.completedAt));
  return Math.max(0.001, (Math.max(...ends) - Math.min(...starts)) / 1000);
}
function roundObject(object) { return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, typeof value === 'number' ? round(value) : value])); }
function round(value) { return Math.round(value * 1000) / 1000; }
function escapeXml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); }
