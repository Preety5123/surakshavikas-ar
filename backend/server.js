const express = require('express');
const cors = require('cors');
const path = require('path');
const { load, save } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors()); app.use(express.json());

// Seed demo data if empty
(function seed() {
  const db = load();
  if (!db.workers.length) {
    db.workers = [
      { id: '1', name: 'Ravi Kumar', workerId: 'JH-2026-001', sector: 'Mining', org: 'CCL Mine', language: 'hi', createdAt: new Date().toISOString() },
      { id: '2', name: 'Sita Murmu', workerId: 'JH-2026-002', sector: 'Steel', org: 'SAIL Plant', language: 'sat', createdAt: new Date().toISOString() },
      { id: '3', name: 'Amit Singh', workerId: 'JH-2026-003', sector: 'Mica', org: 'Koderma Unit', language: 'hi', createdAt: new Date().toISOString() }
    ];
    db.results = [
      { id: 'r1', workerId: 'JH-2026-001', workerName: 'Ravi Kumar', moduleId: 'fire', correct: 9, total: 10, score: 90, pct: 90, passed: true, completedAt: '2026-09-26T10:00:00Z' },
      { id: 'r2', workerId: 'JH-2026-002', workerName: 'Sita Murmu', moduleId: 'gas', correct: 8, total: 10, score: 80, pct: 80, passed: true, completedAt: '2026-09-26T11:00:00Z' },
      { id: 'r3', workerId: 'JH-2026-003', workerName: 'Amit Singh', moduleId: 'fire', correct: 6, total: 10, score: 60, pct: 60, passed: false, completedAt: '2026-09-26T12:00:00Z' }
    ];
    db.certificates = [
      { id: 'c1', certificateId: 'SVAR-123456', workerId: 'JH-2026-001', workerName: 'Ravi Kumar', moduleId: 'fire', moduleName: 'Fire & Explosion Response', score: 90, issuedAt: '2026-09-26T10:05:00Z', status: 'VERIFIED' },
      { id: 'c2', certificateId: 'SVAR-234567', workerId: 'JH-2026-002', workerName: 'Sita Murmu', moduleId: 'gas', moduleName: 'Gas Leak & Confined Space', score: 80, issuedAt: '2026-09-26T11:05:00Z', status: 'VERIFIED' }
    ];
    save(db); console.log('Seeded demo data');
  }
})();

// API
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/workers', (req, res) => res.json(load().workers));
app.post('/api/workers', (req, res) => { const db = load(); db.workers.push({ id: Date.now().toString(), ...req.body }); save(db); res.json({ ok: true }); });
app.get('/api/results', (req, res) => res.json(load().results));
app.post('/api/results', (req, res) => { const db = load(); db.results.push(req.body); save(db); res.json({ ok: true }); });
app.get('/api/certificates', (req, res) => res.json(load().certificates));
app.post('/api/certificates', (req, res) => { const db = load(); if (!db.certificates.find(c => c.certificateId === req.body.certificateId)) { db.certificates.push(req.body); save(db); } res.json({ ok: true }); });
app.get('/api/certificates/:id', (req, res) => {
  const c = load().certificates.find(x => x.certificateId === req.params.id);
  if (!c) return res.status(404).json({ error: 'NOT FOUND' });
  res.json({ workerName: c.workerName, moduleName: c.moduleName, score: c.score, issuedAt: c.issuedAt, certificateId: c.certificateId, status: c.status });
});
app.get('/api/stats', (req, res) => {
  const db = load();
  const passed = db.results.filter(r => r.passed).length;
  res.json({
    totalWorkers: db.workers.length, completed: passed,
    inProgress: db.results.filter(r => !r.passed).length,
    certs: db.certificates.length,
    avgScore: db.results.length ? Math.round(db.results.reduce((a, b) => a + (b.pct || 0), 0) / db.results.length) : 0,
    passRate: db.results.length ? Math.round((passed / db.results.length) * 100) : 0,
    byModule: ['fire', 'gas'].map(m => ({ module: m, count: db.results.filter(r => r.moduleId === m).length, pass: db.results.filter(r => r.moduleId === m && r.passed).length })),
    bySector: ['Mining', 'Steel', 'Mica', 'Other'].map(s => ({ sector: s, count: db.workers.filter(w => w.sector === s).length })),
    byLang: ['hi', 'en', 'sat'].map(l => ({ lang: l, count: db.workers.filter(w => w.language === l).length })),
    workers: db.workers.map(w => { const rs = db.results.filter(r => r.workerId === w.workerId); const last = rs[rs.length - 1]; const cert = db.certificates.find(c => c.workerId === w.workerId); return { ...w, module: last?.moduleId || '—', score: last?.pct ?? '—', status: last ? (last.passed ? 'Passed' : 'Failed') : 'Not started', cert: cert?.certificateId || '—' }; })
  });
});

// Public verification page /verify/SVAR-XXXXXX
app.get('/verify/:id', (req, res) => {
  const c = load().certificates.find(x => x.certificateId === req.params.id);
  res.send(`<!doctype html><html><head><meta name=viewport content="width=device-width,initial-scale=1"><title>Verify ${req.params.id}</title>
  <style>body{font-family:system-ui;background:#0B1F3A;color:#fff;display:flex;justify-content:center;padding:24px} .c{background:#fff;color:#111;border-radius:16px;padding:28px;max-width:440px;width:100%;text-align:center} .ok{font-size:26px;font-weight:900;color:#0E7C3E} .bad{font-size:26px;font-weight:900;color:#D92D20}</style></head><body><div class=c>
  <h2>⛑️ SURAKSHAVIKAS AR</h2><h3>Certificate Verification</h3><p>Certificate ID: <b>${req.params.id}</b></p>
  ${c ? `<p class=ok>✅ VALID CERTIFICATE</p><p>Worker: <b>${c.workerName}</b><br>Training: ${c.moduleName}<br>Score: ${c.score}%<br>Completion: ${new Date(c.issuedAt).toDateString()}</p>`
       : `<p class=bad>❌ CERTIFICATE NOT FOUND</p><p>No record for this ID.</p>`}
  <p style="font-size:12px;color:#555">SIMULATION training record. Follow approved workplace SOPs in real emergencies.</p></div></body></html>`);
});

// Serve admin dashboard static
app.get('/mobile-preview', (req, res) => res.sendFile(path.join(__dirname, '../mobile-app/web-preview.html')));
app.use('/', express.static(path.join(__dirname, '../admin-dashboard')));

app.listen(PORT, '0.0.0.0', () => console.log(`SurakshaVikas backend on :${PORT}`));
