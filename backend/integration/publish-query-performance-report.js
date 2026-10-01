'use strict';

const fs = require('node:fs');

function escapeWorkflowCommand(value) {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function loadReport(reportPath) {
  if (!reportPath) throw new Error('Query performance report path is required');
  const raw = fs.readFileSync(reportPath, 'utf8');
  const report = JSON.parse(raw);
  if (!report || !Array.isArray(report.measurements) || report.measurements.length !== 6) {
    throw new Error('Query performance report must contain exactly six measurements');
  }
  return report;
}

const report = loadReport(process.argv[2]);
const payload = JSON.stringify(report);
console.log(
  `::notice file=backend/integration/query-performance.pg.spec.js,line=1,title=T14 PostgreSQL baseline::${escapeWorkflowCommand(payload)}`
);
