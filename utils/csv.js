const FORMULA = /^[=+\-@]/;

function csvCell(value) {
  const raw = value == null ? '' : String(value);
  const guarded = FORMULA.test(raw) ? `'${raw}` : raw;
  return `"${guarded.replace(/"/g, '""')}"`;
}

function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(','));
  }
  return lines.join('\n');
}

module.exports = { csvCell, toCsv };
