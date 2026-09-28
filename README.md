# ⛑️ SurakshaVikas AR — Learn Safety. Practice Safely. Work Confidently.

Government of Jharkhand · mobile-first vocational safety training (Android 10+, no headset needed).

## 60-second judge demo
1. Open `mobile-app/web-preview.html` **or** run backend + open `http://localhost:4000/mobile-preview`.
2. 🎯 **Demo Mode → Fire AR** → tap 🔥 fire → 🧯 ABC Powder → 🚪 Exit B.
3. Complete evacuation sequence (Alarm first, Assembly last).
4. Assessment (10 Qs, 70% pass) → Generate Certificate → QR → **✅ VALID CERTIFICATE**.
5. Open Admin Dashboard (`http://localhost:4000`) → login `admin / admin123` → stats, charts, worker table, verify `SVAR-123456`.

## Run
```bash
# backend + admin dashboard + verification API
cd backend && npm install && npm start   # :4000

# mobile app (Expo)
cd mobile-app && npm install && npx expo start
# open web-preview.html for zero-install mobile demo
```

## Structure
```
/mobile-app        Expo React Native app (App.js) + web-preview.html (zero-install demo)
  /src/engine     i18n.js, store.js (AsyncStorage offline + sync), assessment.js (reusable)
  App.js          Splash→Onboarding→Language→Register→Dashboard→Fire/Gas AR→Seq→Assess→Cert→Verify
/admin-dashboard  index.html — login, cards, Chart.js analytics, filters, verification
/backend          Express API + /verify/:id public page + serves dashboard
/assets           icon/splash placeholders (replace with final art)
/localization     en.json (full), hi.json (full), sat.json (Santali scaffold)
/docs             ARCHITECTURE.md, DEMO.md, API.md, SAFETY.md
```

## Offline-first
AsyncStorage/localStorage holds modules, questions, progress, scores, certs, language. `trySync()` POSTs queued results/certificates when online. Offline banner shown.

## AR + fallback
`expo-camera` + animated anchored markers (🔥🧯🚪➡️📍). If permission denied → Interactive Simulation Mode with identical tasks. No crash.

## Safety
SIMULATION badge + disclaimer on every screen. No real-world dangerous instructions.
