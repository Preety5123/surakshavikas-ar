# Architecture
```
[Expo App] --AsyncStorage--> offline queue --POST /api/*--> [Express :4000] --db.json
   | Camera + Marker overlay (AR) / Simulation fallback
   | assessment.js (grade, PASS>=70)  | QR (cert URL /verify/SVAR-x)
[Admin dashboard (static)] --GET /api/stats--> cards, charts, table, verify
[Public /verify/:id] --> VALID / NOT FOUND (minimal PII)
```
Models: Worker{id,name,workerId,sector,org,language,createdAt}, Module{id,title,…}, Assessment{id,moduleId,…}, Result{id,workerId,moduleId,score,pct,passed,completedAt}, Certificate{id,certificateId,workerId,moduleId,score,issuedAt,status}.
Add a module: add ASSESSMENTS key + intro/AR screens + dashboard entry. Assessment engine is shared.
