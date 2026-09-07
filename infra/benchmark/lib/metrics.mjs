export function nearestRank(values, percentile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1];
}

export function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function summarizeRequests(records, durationSeconds) {
  const latencies = records.filter((item) => item.ok).map((item) => item.latencyMs);
  const failures = records.length - latencies.length;
  return {
    requests: records.length,
    successes: latencies.length,
    failures,
    throughput: durationSeconds > 0 ? latencies.length / durationSeconds : 0,
    failureRate: records.length > 0 ? failures / records.length : 0,
    p50Ms: nearestRank(latencies, 50),
    p95Ms: nearestRank(latencies, 95),
    p99Ms: nearestRank(latencies, 99),
  };
}

export function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows, columns) {
  return `${columns.join(',')}\n${rows
    .map((row) => columns.map((column) => csvCell(row[column])).join(','))
    .join('\n')}\n`;
}

export function normalizeError(error, status, body) {
  if (status) {
    const code = body && typeof body === 'object' && typeof body.code === 'string'
      ? body.code
      : `HTTP_${status}`;
    return code.replace(/[^A-Z0-9_]/g, '_').slice(0, 64);
  }
  const name = error instanceof Error ? error.name : 'Error';
  if (name === 'AbortError' || name === 'TimeoutError') return 'CLIENT_TIMEOUT';
  return 'TRANSPORT_ERROR';
}

export function assertSanitizedRecord(record) {
  const forbidden = ['cookie', 'password', 'details', 'score', 'grade', 'hostname', 'path', 'message'];
  for (const key of forbidden) {
    if (Object.hasOwn(record, key)) throw new Error(`Sensitive raw field is forbidden: ${key}`);
  }
}
