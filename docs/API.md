# API
- GET /api/health
- GET/POST /api/workers
- GET/POST /api/results
- GET/POST /api/certificates
- GET /api/certificates/:id → {workerName,moduleName,score,issuedAt,certificateId,status} or 404
- GET /api/stats → {totalWorkers,completed,inProgress,certs,avgScore,passRate,byModule,bySector,byLang,workers[]}
- GET /verify/:id → public HTML VALID / NOT FOUND
Sample: `curl localhost:4000/api/stats`, verify `SVAR-123456`.
