const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { stringify } = require('csv-stringify');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Sample in-memory data (replace with DB calls)
const SAMPLE_REPORT_ROWS = [];
for (let i = 1; i <= 200; i++) {
  SAMPLE_REPORT_ROWS.push({
    id: i,
    user: `user_${(i % 10) + 1}`,
    amount: Math.round(Math.random() * 1000),
    date: new Date(2025, 0, (i % 28) + 1).toISOString().slice(0, 10),
    status: i % 3 === 0 ? 'closed' : 'open'
  });
}

// Helper: apply filters
function applyFilters(rows, filters) {
  let r = rows;
  if (filters.from) {
    r = r.filter(x => x.date >= filters.from);
  }
  if (filters.to) {
    r = r.filter(x => x.date <= filters.to);
  }
  if (filters.user) {
    r = r.filter(x => x.user === filters.user);
  }
  if (filters.status) {
    r = r.filter(x => x.status === filters.status);
  }
  return r;
}

// GET /api/reports
app.get('/api/reports', (req, res) => {
  const { from, to, user, status, page = 1, perPage = 25, sort = 'date:desc' } = req.query;
  const filters = { from, to, user, status };
  let results = applyFilters(SAMPLE_REPORT_ROWS, filters);

  // sorting
  const [sortField, sortDir] = sort.split(':');
  results.sort((a, b) => {
    if (a[sortField] < b[sortField]) return sortDir === 'desc' ? 1 : -1;
    if (a[sortField] > b[sortField]) return sortDir === 'desc' ? -1 : 1;
    return 0;
  });

  const total = results.length;
  const p = Math.max(1, parseInt(page, 10));
  const pp = Math.max(1, parseInt(perPage, 10));
  const start = (p - 1) * pp;
  const paged = results.slice(start, start + pp);

  res.json({ data: paged, meta: { total, page: p, perPage: pp } });
});

// GET /api/reports/:id
app.get('/api/reports/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = SAMPLE_REPORT_ROWS.find(r => r.id === id);
  if (!row) return res.status(404).json({ error: { code: 'not_found', message: 'Report row not found' } });
  res.json({ data: row });
});

// POST /api/reports/export
app.post('/api/reports/export', (req, res) => {
  const { filters = {}, format = 'csv' } = req.body || {};
  const rows = applyFilters(SAMPLE_REPORT_ROWS, filters);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
    const columns = Object.keys(rows[0] || {});
    const stringifier = stringify({ header: true, columns });
    stringifier.pipe(res);
    for (const r of rows) stringifier.write(r);
    stringifier.end();
    return;
  }

  res.status(400).json({ error: { code: 'unsupported_format', message: 'Only csv supported in sample' } });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Reports backend sample listening on ${port}`));
















