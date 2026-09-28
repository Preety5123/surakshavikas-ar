import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, Animated, Alert, PanResponder } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t, LANGS } from './src/engine/i18n';
import { Store, BACKEND_URL, trySync, makeCertId } from './src/engine/store';
import { ASSESSMENTS, grade } from './src/engine/assessment';
import en from './localization/en.json';

const C = { navy: '#0B1F3A', saffron: '#F5820B', green: '#0E7C3E', red: '#D92D20', bg: '#F4F6FA', white: '#fff', yellow: '#FFC107' };

function BigBtn({ title, onPress, color, icon }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[s.btn, { backgroundColor: color || C.saffron }]}>
      <Text style={s.btnT}>{icon ? icon + '  ' : ''}{title}</Text>
    </TouchableOpacity>
  );
}
function Card({ children, style }) { return <View style={[s.card, style]}>{children}</View>; }
function Badge({ txt, color }) { return <View style={[s.badge, { backgroundColor: color || C.red }]}><Text style={s.badgeT}>{txt}</Text></View>; }

// Floating AR marker (animated, anchored feel)
function Marker({ emoji, label, sub, style, onPress, dim }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.loop(Animated.sequence([Animated.timing(a, { toValue: -10, duration: 900, useNativeDriver: true }), Animated.timing(a, { toValue: 0, duration: 900, useNativeDriver: true })])).start(); }, []);
  return (
    <Animated.View style={[{ transform: [{ translateY: a }], opacity: dim ? 0.55 : 1 }, style]}>
      <TouchableOpacity onPress={onPress} style={s.marker}>
        <Text style={{ fontSize: 44 }}>{emoji}</Text>
        <Text style={s.markerT}>{label}</Text>
        {!!sub && <Text style={s.markerS}>{sub}</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function App() {
  const [screen, setScreen] = useState('splash');
  const [lang, setLang] = useState('hi');
  const [worker, setWorker] = useState(null);
  const [module, setModule] = useState(null);
  const [params, setParams] = useState({});
  const [online, setOnline] = useState(true);
  const [progress, setProgress] = useState({});
  const [permission, reqPerm] = useCameraPermissions();

  const L = (k) => t(lang, k);
  const go = (sc, p = {}) => { setParams(p); setScreen(sc); };

  useEffect(() => { (async () => {
    const l = await Store.getLang(); if (l) setLang(l);
    const w = await Store.getWorker(); if (w) setWorker(w);
    const pr = await Store.getProgress(); setProgress(pr || {});
    setTimeout(() => setScreen(w ? 'dashboard' : 'onboarding'), 1200);
    const r = await trySync(); setOnline(r.online);
  })(); }, []);

  const saveLang = async (l) => { setLang(l); await Store.setLang(l); };

  return (
    <SafeAreaProvider>
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      {/* Top bar */}
      <View style={s.top}>
        <Text style={s.topT}>⛑️ SurakshaVikas AR</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Text style={{ color: online ? '#7CFC9A' : '#FFB020', fontWeight: '700' }}>{online ? '📶' : '📡 Offline'}</Text>
          <TouchableOpacity onPress={() => go('settings')}><Text style={{ color: '#fff', fontSize: 20 }}>⚙️</Text></TouchableOpacity>
        </View>
      </View>

      {screen === 'splash' && <Splash L={L} />}
      {screen === 'onboarding' && <Onboarding L={L} go={go} />}
      {screen === 'language' && <Language L={L} lang={lang} saveLang={saveLang} go={go} />}
      {screen === 'register' && <Register L={L} lang={lang} go={go} setWorker={setWorker} />}
      {screen === 'dashboard' && <Dashboard L={L} worker={worker} progress={progress} setProgress={setProgress} go={go} online={online} />}
      {screen === 'fireIntro' && <FireIntro L={L} go={go} />}
      {screen === 'fireAR' && <FireAR L={L} go={go} permission={permission} reqPerm={reqPerm} />}
      {screen === 'fireSeq' && <FireSeq L={L} go={go} />}
      {screen === 'gasIntro' && <GasIntro L={L} go={go} />}
      {screen === 'gasAR' && <GasAR L={L} go={go} permission={permission} reqPerm={reqPerm} />}
      {screen === 'assessment' && <Assess L={L} module={params.module || module} go={go} worker={worker} />}
      {screen === 'result' && <Result L={L} data={params} go={go} worker={worker} />}
      {screen === 'certificate' && <Cert L={L} data={params} go={go} />}
      {screen === 'history' && <History L={L} go={go} />}
      {screen === 'settings' && <Settings L={L} lang={lang} saveLang={saveLang} go={go} worker={worker} setWorker={setWorker} />}
      {screen === 'verify' && <Verify L={L} go={go} />}

      <View style={s.discl}><Text style={s.disclT}>⚠️ {L('simulation_badge')} • {L('disclaimer')}</Text></View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

/* ---------- Screens ---------- */
function Splash({ L }) {
  return <View style={s.center}><Text style={{ fontSize: 80 }}>⛑️</Text><Text style={s.h1}>SurakshaVikas AR</Text><Text style={s.sub}>{L('tagline')}</Text><Text style={s.sub2}>Govt. of Jharkhand • Vocational Safety</Text></View>;
}
function Onboarding({ L, go }) {
  return <View style={s.center}>
    <Text style={{ fontSize: 64 }}>🦺</Text><Text style={s.h1}>{L('welcome')}</Text><Text style={s.sub}>{L('tagline')}</Text>
    <BigBtn title={L('select_language') + ' / भाषा चुनें'} onPress={() => go('language')} />
    <BigBtn title={'🎯 ' + L('demo_mode')} color="#0E7C3E" onPress={() => go('fireIntro', { demo: true })} />
  </View>;
}
function Language({ L, lang, saveLang, go }) {
  return <View style={s.pad}><Text style={s.h2}>{L('select_language')}</Text>
    {LANGS.map(l => <TouchableOpacity key={l.code} onPress={() => saveLang(l.code)} style={[s.langOpt, lang === l.code && s.langSel]}><Text style={s.langT}>{l.label}</Text>{lang === l.code && <Text>✅</Text>}</TouchableOpacity>)}
    <BigBtn title="→" onPress={() => go('register')} />
  </View>;
}
function Register({ L, lang, go, setWorker }) {
  const [f, setF] = useState({ name: '', workerId: '', age: '25–34', sector: 'Mining', org: '', language: lang });
  const set = (k, v) => setF({ ...f, [k]: v });
  const submit = async () => {
    if (!f.name || !f.workerId) { Alert.alert('⚠️', 'Name + Worker ID required / नाम + श्रमिक ID आवश्यक'); return; }
    const w = { id: Date.now().toString(), name: f.name, workerId: f.workerId, age: f.age, sector: f.sector, org: f.org, language: lang, createdAt: new Date().toISOString() };
    await Store.setWorker(w); setWorker(w);
    try { await fetch(BACKEND_URL + '/api/workers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(w) }); } catch {}
    go('dashboard');
  };
  return <ScrollView style={s.pad}><Text style={s.h2}>📝 {L('register')}</Text>
    <Text style={s.lbl}>{L('full_name')}</Text><TextInput style={s.inp} value={f.name} onChangeText={v => set('name', v)} placeholder="Ravi Kumar" />
    <Text style={s.lbl}>{L('worker_id')}</Text><TextInput style={s.inp} value={f.workerId} onChangeText={v => set('workerId', v)} placeholder="JH-2026-001" />
    <Text style={s.lbl}>{L('sector')}</Text>
    <View style={s.row}>{['Mining', 'Steel', 'Mica', 'Other'].map(x => <TouchableOpacity key={x} onPress={() => set('sector', x)} style={[s.chip, f.sector === x && s.chipSel]}><Text style={f.sector === x ? s.chipTsel : s.chipT}>{x}</Text></TouchableOpacity>)}</View>
    <Text style={s.lbl}>{L('organization')}</Text><TextInput style={s.inp} value={f.org} onChangeText={v => set('org', v)} placeholder="CCL Mine / SAIL Plant" />
    <BigBtn title={L('register')} onPress={submit} />
    <BigBtn title={'🎯 ' + L('demo_mode')} color="#0E7C3E" onPress={() => go('fireIntro', { demo: true })} />
  </ScrollView>;
}
function Dashboard({ L, worker, progress, setProgress, go, online }) {
  const [results, setResults] = useState([]);
  useEffect(() => { (async () => { setResults(await Store.getResults()); setProgress(await Store.getProgress()); })(); }, []);
  const pct = Math.round((Object.keys(progress).filter(k => progress[k]?.done).length / 5) * 100);
  const mods = [
    { id: 'fire', icon: '🔥', key: 'fire_response', live: true },
    { id: 'gas', icon: '☠️', key: 'gas_leak', live: true },
    { id: 'mach', icon: '⚙️', key: 'machinery_safety', live: false },
    { id: 'ppe', icon: '🦺', key: 'ppe_safety', live: false },
    { id: 'emg', icon: '⛑️', key: 'emergency_response', live: false },
  ];
  return <ScrollView style={s.pad}>
    <Text style={s.h2}>{L('namaste')}, {worker?.name || 'Worker'} 🙏</Text>
    <Text style={{ color: online ? C.green : C.red, fontWeight: '700' }}>{online ? '📶 ' + L('online_mode') : '📡 ' + L('offline_mode')}</Text>
    <Card><Text style={{ fontWeight: '800' }}>{L('training_progress')} — {pct}%</Text><View style={s.bar}><View style={[s.barFill, { width: pct + '%' }]} /></View></Card>
    {mods.map(m => <TouchableOpacity key={m.id} disabled={!m.live} onPress={() => go(m.id === 'fire' ? 'fireIntro' : 'gasIntro')} style={[s.mod, !m.live && { opacity: 0.6 }]}>
      <Text style={{ fontSize: 34 }}>{m.icon}</Text>
      <View style={{ flex: 1 }}><Text style={s.modT}>{L(m.key)}</Text><Text>{progress[m.id]?.done ? '✅ ' + L('completed') : m.live ? '▶️ ' + L('start_training') : '🔜 ' + L('coming_soon')}</Text></View>
      <Text style={{ fontSize: 24 }}>{m.live ? '›' : '🔒'}</Text>
    </TouchableOpacity>)}
    <View style={s.row2}>
      <BigBtn title={'📜 ' + L('training_history')} onPress={() => go('history')} color={C.navy} />
      <BigBtn title={'✅ ' + L('verify_certificate')} onPress={() => go('verify')} color={C.green} />
    </View>
  </ScrollView>;
}

/* FIRE */
function FireIntro({ L, go }) {
  return <ScrollView style={s.pad}><Badge txt={L('simulation_badge')} /><Text style={s.h2}>🔥 {L('fire_response')}</Text>
    <Card><Text style={s.obj}>🔥 FIRE EMERGENCY — Underground & Surface</Text><Text>"Methane / coal-dust or electrical-panel fire detected. Floor plane mapped. Knock it down with the PASS protocol, then evacuate via the intake airway."</Text><Text>{'\n'}1. Identify the fire hazard{'\n'}2. Select ABC Powder / CO₂ extinguisher{'\n'}3. PASS: Pull pin → Aim at base → Squeeze & Sweep{'\n'}4. Follow green chevrons (avoid smoke zones){'\n'}5. Reach the assembly point</Text></Card>
    <BigBtn title={L('start_ar') + ' 📷'} onPress={() => go('fireAR')} />
  </ScrollView>;
}
function ARFrame({ children, permission, reqPerm, L }) {
  if (!permission?.granted) return <View style={s.pad}><Text style={s.h2}>📷 AR Camera</Text><Text>{L('ar_unavailable')}</Text><BigBtn title="Grant Camera / Continue Simulation" onPress={async () => { try { await reqPerm(); } catch {} }} />{children}</View>;
  return <View style={{ flex: 1 }}>
    <CameraView style={StyleSheet.absoluteFill} />
    <View style={[StyleSheet.absoluteFill, { justifyContent: 'center' }]}>{children}</View>
  </View>;
}
/* PASS protocol: Pull → Aim (base) → Squeeze & Sweep, then AR evacuation routing */
function PassStage({ pass, setPass, setMsg, next }) {
  const pip = (k, label) => { const order = ['pull', 'aim', 'sweep']; const cur = order.indexOf(pass); const idx = order.indexOf(k);
    return <Text style={{ fontWeight: '900', color: idx < cur ? '#7CFC9A' : idx === cur ? '#FFC107' : '#888' }}>{idx < cur ? '✅' : '⭕'} {label}  </Text>; };
  return <View>
    <Text style={s.taskT}>🧯 PASS Protocol</Text>
    <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 8 }}>{pip('pull', 'Pull')}{pip('aim', 'Aim')}{pip('sweep', 'Squeeze+Sweep')}</View>
    {pass === 'pull' && <PullPin onDone={() => { setMsg('✅ Pin pulled! Nozzle armed.'); setPass('aim'); }} />}
    {pass === 'aim' && <AimBase onMsg={setMsg} onOk={() => { setMsg('✅ Aim locked on the fuel base!'); setPass('sweep'); }} />}
    {pass === 'sweep' && <Sweep onMsg={setMsg} onDone={() => { setMsg('✅ Fire knocked down! Follow the green chevrons.'); next(); }} />}
  </View>;
}
function PullPin({ onDone }) {
  const [dy, setDy] = useState(0);
  const pr = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
    onPanResponderMove: (e, g) => setDy(Math.min(0, g.dy)),
    onPanResponderRelease: (e, g) => { if (g.dy < -50 || g.dx > 50) onDone(); else setDy(0); },
  })).current;
  return <View style={{ alignItems: 'center' }}>
    <Text style={{ color: '#fff', marginBottom: 6 }}>P — 👆 drag the safety ring UP / sideways</Text>
    <View style={s.extBody}><Text style={{ fontSize: 56 }}>🧯</Text>
      <Animated.View style={{ transform: [{ translateY: dy }] }} {...pr.panHandlers}>
        <View style={s.pin}><Text style={{ fontSize: 26 }}>⭕</Text></View>
      </Animated.View>
    </View>
  </View>;
}
function AimBase({ onMsg, onOk }) {
  return <View style={{ alignItems: 'center' }}>
    <Text style={{ color: '#fff', marginBottom: 6 }}>A — 🎯 tap ONLY the base of the flames</Text>
    <TouchableOpacity activeOpacity={0.85} onPress={() => onMsg('❌ That is smoke — raycast must hit the fuel, not smoke.')} style={s.smokeZone}><Text style={{ fontSize: 26 }}>💨💨 smoke 💨💨</Text></TouchableOpacity>
    <TouchableOpacity activeOpacity={0.85} onPress={() => onMsg('❌ Too high — flame tips re-ignite. Aim LOW.')} style={s.flameTop}><Text style={{ fontSize: 44 }}>🔥🔥🔥</Text></TouchableOpacity>
    <TouchableOpacity activeOpacity={0.85} onPress={onOk} style={s.flameBase}><Text style={{ fontSize: 22, fontWeight: '900' }}>🎯 FUEL BASE — tap here</Text></TouchableOpacity>
  </View>;
}
function Sweep({ onMsg, onDone }) {
  const [zones, setZones] = useState([false, false, false]);
  const [spray, setSpray] = useState(false);
  const width = useRef(300); const doneRef = useRef(false); const nag = useRef(null);
  const mark = (e) => {
    const w = width.current || 300; const x = Math.max(0, Math.min(w - 1, e.nativeEvent.locationX));
    const idx = Math.min(2, Math.floor((x / w) * 3));
    setSpray(true); if (nag.current) clearTimeout(nag.current);
    nag.current = setTimeout(() => { setSpray(s => { if (s) onMsg('⚠️ Keep sweeping side-to-side — do not hold in one spot!'); return s; }); }, 2500);
    setZones(z => { if (z[idx]) return z; const n = [...z]; n[idx] = true; onMsg('🌫️ S covering ' + (n.filter(Boolean).length) + '/3 of flame front…');
      if (n.every(Boolean) && !doneRef.current) { doneRef.current = true; setTimeout(onDone, 700); } return n; });
  };
  useEffect(() => () => { if (nag.current) clearTimeout(nag.current); }, []);
  const covered = zones.filter(Boolean).length;
  return <View style={{ alignItems: 'center' }}>
    <Text style={{ color: '#fff', marginBottom: 6 }}>S+S — hold & SWEEP across the full flame front</Text>
    <Text style={{ fontSize: 44 - covered * 10 }}>{'🔥'.repeat(Math.max(0, 3 - covered))}{covered >= 3 && '✅'}</Text>
    {spray && <Text style={{ fontSize: 30 }}>🌫️💨 dry-powder cone</Text>}
    <View onLayout={e => { width.current = e.nativeEvent.layout.width; }}
      onTouchStart={mark} onTouchMove={mark} onTouchEnd={() => setSpray(false)} style={s.sweepZone}>
      <Text style={{ color: '#fff', textAlign: 'center' }}>👆 HOLD here & drag left ↔ right</Text>
      <View style={s.bar}><View style={[s.barFill, { width: (covered / 3 * 100) + '%' }]} /></View>
      <Text style={{ color: '#FFC107', textAlign: 'center' }}>{covered}/3 zones • must cover all while spraying</Text>
    </View>
  </View>;
}
function EvacRoute({ onMsg, onOk }) {
  const tt = useRef(new Animated.Value(0)).current;
  useEffect(() => { const l = Animated.loop(Animated.timing(tt, { toValue: 1, duration: 1400, useNativeDriver: true })); l.start(); return () => l.stop(); }, []);
  const Chev = ({ d }) => { const op = tt.interpolate({ inputRange: [0, 0.34, 0.67, 1], outputRange: d === 0 ? [1, 0.25, 0.25, 1] : d === 1 ? [0.25, 1, 0.25, 0.25] : [0.25, 0.25, 1, 0.25] });
    return <Animated.Text style={{ fontSize: 32, opacity: op }}>➡️</Animated.Text>; };
  return <View>
    <Text style={s.taskT}>🚪 Evacuation — follow GREEN chevrons (intake airway)</Text>
    <TouchableOpacity onPress={() => onMsg('⚠️ Unsafe — return airway, smoke accumulation!')} style={s.routeA}>
      <Text style={{ fontWeight: '800' }}>Route A — return airway</Text><Text style={{ fontSize: 26 }}>💨💨🔥 smoke</Text><Text>blocked ⛔</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={onOk} style={s.routeB}>
      <Text style={{ fontWeight: '800' }}>Route B — intake airway ✅</Text>
      <View style={{ flexDirection: 'row' }}><Chev d={0} /><Chev d={1} /><Chev d={2} /><Text style={{ fontSize: 26 }}>📍</Text></View>
      <Text>fresh air • tap to evacuate</Text>
    </TouchableOpacity>
  </View>;
}
function FireAR({ L, go, permission, reqPerm }) {
  const [step, setStep] = useState(0); const [msg, setMsg] = useState(L('identify_fire'));
  const [pass, setPass] = useState('pull');
  const pick = (ok, good, bad) => { setMsg(ok ? good : bad); if (ok) setTimeout(() => setStep(s => s + 1), 900); };
  return <View style={{ flex: 1 }}>
    <View style={s.arHead}><Text style={s.arHeadT}>📷 CAMERA VIEW • 🔴 REC</Text><Badge txt={L('simulation_badge')} color={C.saffron} /></View>
    <ARFrame permission={permission} reqPerm={reqPerm} L={L}>
      <View style={s.arSpace}>
        {step === 0 && <><Marker emoji="🔥" label="FIRE" sub="⚠️ hazard" onPress={() => pick(true, L('correct_fire'), '')} style={{ alignSelf: 'center', marginTop: 30 }} /><View style={s.row2}><Marker emoji="🪑" label="Chair" onPress={() => pick(false, '', L('incorrect_fire'))} /><Marker emoji="💧" label="Water" onPress={() => pick(false, '', L('incorrect_fire'))} /></View></>}
        {step === 1 && <><Text style={s.taskT}>🧯 {L('select_extinguisher')} — methane / coal-dust / panel fire</Text><View style={s.row2}><Marker emoji="🧯" label="ABC Powder / CO₂" sub="✔ scenario" onPress={() => pick(true, '✅ Correct! Now the PASS protocol.', '')} /><Marker emoji="🪣" label="Water bucket" onPress={() => pick(false, '', '❌ Incorrect — water spreads electrical & dust fires')} /></View></>}
        {step === 2 && <PassStage pass={pass} setPass={setPass} setMsg={setMsg} next={() => setStep(3)} />}
        {step === 3 && <EvacRoute onMsg={setMsg} onOk={() => { setMsg('✅ Safe route! Reached assembly point.'); setStep(4); }} />}
        {step >= 4 && <View style={s.pad}><Text style={s.h2}>✅ {L('evac_complete')}</Text><BigBtn title="Next: Evacuation Sequence →" onPress={() => go('fireSeq')} /></View>}
      </View>
    </ARFrame>
    <View style={s.msgBar}><Text style={s.msgT}>{msg}</Text></View>
  </View>;
}
function FireSeq({ L, go }) {
  const correct = ['Raise alarm', 'Identify hazard', 'Alert others', 'Select safe exit', 'Evacuate', 'Reach assembly point'];
  const [order, setOrder] = useState([...correct].sort(() => Math.random() - 0.5)); const [done, setDone] = useState(false);
  const moveUp = (i) => { if (i === 0) return; const a = [...order]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setOrder(a); };
  return <ScrollView style={s.pad}><Text style={s.h2}>↕️ Evacuation Sequence</Text>
    {order.map((x, i) => <TouchableOpacity key={x} onPress={() => moveUp(i)} style={s.seq}><Text>{i + 1}. {x}  ⬆️ tap to move up</Text></TouchableOpacity>)}
    <BigBtn title="Check Sequence" onPress={() => { if (JSON.stringify(order) === JSON.stringify(correct)) setDone(true); else Alert.alert('❌', 'Order incorrect — Alarm first, Assembly last.'); }} />
    {done && <><Text style={s.h2}>✅ {L('evac_complete')}</Text><BigBtn title={L('assessment') + ' →'} color={C.green} onPress={() => go('assessment', { module: 'fire' })} /></>}
  </ScrollView>;
}

/* GAS */
function GasIntro({ L, go }) {
  return <ScrollView style={s.pad}><Badge txt={L('simulation_badge')} /><Text style={s.h2}>☠️ {L('gas_leak')}</Text>
    <Card><Text>"Gas leakage suspected in a confined area. Identify the hazardous zone and choose the correct safety response."</Text><Text>{'\n'}1. Identify hazard zone{'\n'}2. Select PPE{'\n'}3. Buddy-system procedure{'\n'}4. Identify unsafe behavior</Text></Card>
    <BigBtn title={L('start_ar') + ' 📷'} onPress={() => go('gasAR')} />
  </ScrollView>;
}
function GasAR({ L, go, permission, reqPerm }) {
  const [step, setStep] = useState(0); const [msg, setMsg] = useState(L('identify_gas'));
  const ok = (m) => { setMsg(m); setTimeout(() => setStep(s => s + 1), 900); };
  return <View style={{ flex: 1 }}>
    <View style={s.arHead}><Text style={s.arHeadT}>📷 CAMERA VIEW • 🔴 REC</Text><Badge txt={L('simulation_badge')} color={C.saffron} /></View>
    <ARFrame permission={permission} reqPerm={reqPerm} L={L}>
      <View style={s.arSpace}>
        {step === 0 && <View style={s.row2}><Marker emoji="🟢" label="SAFE AREA" onPress={() => setMsg('❌ ' + L('hazard_zone') + '? No — that is safe.')} /><Marker emoji="🟡" label="CAUTION" onPress={() => setMsg('⚠️ Caution — keep back.')} /><Marker emoji="🔴" label="GAS HAZARD ☠️" onPress={() => ok('✅ Correct! 🔴 Gas Hazard identified.')} /></View>}
        {step === 1 && <><Text style={s.taskT}>🦺 Select required safety equipment</Text><View style={s.row2}><Marker emoji="😷" label="Respiratory protection" onPress={() => ok('✅ Correct action indicator')} /><Marker emoji="🕶️" label="Sunglasses" onPress={() => setMsg('❌ Incorrect action indicator')} /><Marker emoji="🩴" label="Sandals" onPress={() => setMsg('❌ Incorrect action indicator')} /></View></>}
        {step === 2 && <View style={s.pad}><Text style={s.h2}>{L('buddy_q')}</Text><View style={s.row2}><TouchableOpacity style={s.opt} onPress={() => setMsg('❌ Wrong — never alone.')}><Text style={s.optT}>A. {L('buddy_yes')}</Text></TouchableOpacity><TouchableOpacity style={s.opt} onPress={() => ok('✅ ' + L('buddy_explain'))}><Text style={s.optT}>B. {L('buddy_no')}</Text></TouchableOpacity></View></View>}
        {step === 3 && <View style={s.pad}><Text style={s.h2}>Identify the UNSAFE action</Text>{['Checking area per procedure ✔', 'Using appropriate PPE ✔', 'Entering alone ✖', 'Following communication ✔'].map(x => <TouchableOpacity key={x} style={s.seq} onPress={() => x.includes('alone') ? ok('✅ Correct — entering alone is unsafe.') : setMsg('❌ That action is safe.')}><Text>👷 {x}</Text></TouchableOpacity>)}</View>}
        {step >= 4 && <View style={s.pad}><Text style={s.h2}>✅ Training Complete</Text><BigBtn title={L('assessment') + ' →'} color={C.green} onPress={() => go('assessment', { module: 'gas' })} /></View>}
      </View>
    </ARFrame>
    <View style={s.msgBar}><Text style={s.msgT}>{msg}</Text></View>
  </View>;
}

/* Assessment / Result / Cert */
function Assess({ L, module, go, worker }) {
  const qs = ASSESSMENTS[module || 'fire'];
  const [i, setI] = useState(0); const [ans, setAns] = useState([]);
  const t0 = useRef(Date.now());
  if (i >= qs.length) {
    const g = grade(module || 'fire', ans);
    const res = { id: Date.now().toString(), workerId: worker?.workerId || 'DEMO', workerName: worker?.name || 'Demo Worker', moduleId: module || 'fire', ...g, attempt: 1, completedAt: new Date().toISOString(), timeSec: Math.round((Date.now() - t0.current) / 1000) };
    Store.addResult(res).catch(() => {});
    Store.getProgress().then(async p => { p[module || 'fire'] = { done: g.passed, score: g.pct }; await Store.setProgress(p); }).catch(() => {});
    try { fetch(BACKEND_URL + '/api/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(res) }); } catch {}
    setTimeout(() => go('result', { res }), 50);
    return <View style={s.center}><Text>Grading…</Text></View>;
  }
  const q = qs[i];
  return <View style={s.pad}><Text>Q{i + 1}/{qs.length} • ⏱ Assessment</Text><Text style={s.h2}>{q.q}</Text>
    {q.options.map((o, k) => <TouchableOpacity key={k} style={s.opt} onPress={() => { setAns([...ans, k]); setI(i + 1); }}><Text style={s.optT}>{String.fromCharCode(65 + k)}. {o}</Text></TouchableOpacity>)}
  </View>;
}
function Result({ L, data, go, worker }) {
  const r = data.res;
  return <View style={s.center}>
    <Text style={{ fontSize: 64 }}>{r.passed ? '🎉' : '🔁'}</Text>
    <Text style={[s.h1, { color: r.passed ? C.green : C.red }]}>{r.passed ? L('passed') : L('failed')}</Text>
    <Text style={s.h2}>{L('score')}: {r.pct}% ({r.correct}/{r.total})</Text>
    <Text>{r.passed ? L('congratulations') : L('try_again')}</Text>
    {r.passed ? <BigBtn title={'📜 ' + L('generate_certificate')} color={C.green} onPress={async () => {
      const c = { id: Date.now().toString(), certificateId: makeCertId(), workerId: worker?.workerId || 'DEMO-001', workerName: worker?.name || 'Demo Worker', moduleId: r.moduleId, moduleName: r.moduleId === 'fire' ? 'Fire & Explosion Response' : 'Gas Leak & Confined Space', score: r.pct, issuedAt: new Date().toISOString(), status: 'VERIFIED' };
      await Store.addCert(c); try { await fetch(BACKEND_URL + '/api/certificates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }); } catch {}
      go('certificate', { cert: c });
    }} /> : <BigBtn title={'🔁 ' + L('retry')} onPress={() => go('assessment', { module: r.moduleId })} />}
    <BigBtn title="Dashboard" color={C.navy} onPress={() => go('dashboard')} />
  </View>;
}
function Cert({ L, data, go }) {
  const c = data.cert; const url = `${BACKEND_URL}/verify/${c.certificateId}`;
  return <ScrollView style={s.pad}><View style={s.cert}>
    <Text style={s.certH}>SURAKSHAVIKAS AR</Text><Text>Certificate of Safety Training</Text>
    <Text style={{ marginTop: 10 }}>This certifies that</Text><Text style={s.certN}>{c.workerName}</Text>
    <Text>has successfully completed: {c.moduleName}</Text><Text>Score: {c.score}% • Worker ID: {c.workerId}</Text>
    <Text>Date: {new Date(c.issuedAt).toDateString()} • ID: {c.certificateId}</Text><Text>Status: ✅ VERIFIED</Text>
    <View style={{ marginTop: 12, alignItems: 'center' }}><QRCode value={url} size={180} /><Text style={{ fontSize: 11 }}>{url}</Text></View>
  </View>
  <BigBtn title={'✅ ' + L('verify_certificate')} color={C.green} onPress={() => go('verify', { id: c.certificateId })} />
  <BigBtn title="Dashboard" color={C.navy} onPress={() => go('dashboard')} /></ScrollView>;
}
function History({ L, go }) {
  const [rs, setRs] = useState([]); const [cs, setCs] = useState([]);
  useEffect(() => { (async () => { setRs(await Store.getResults()); setCs(await Store.getCerts()); })(); }, []);
  return <ScrollView style={s.pad}><Text style={s.h2}>📜 {L('training_history')}</Text>
    {rs.map((r, i) => <Card key={i}><Text>{r.moduleId} — {r.pct}% {r.passed ? '✅' : '❌'} • {new Date(r.completedAt).toLocaleString()}</Text></Card>)}
    {cs.map((c, i) => <Card key={i}><Text>📜 {c.certificateId} — {c.moduleName} ({c.score}%)</Text></Card>)}
    {!rs.length && <Text>No training yet. Start Demo Mode 🎯</Text>}
    <BigBtn title="← Back" color={C.navy} onPress={() => go('dashboard')} />
  </ScrollView>;
}
function Verify({ L, go }) {
  const [id, setId] = useState(params0(go)); const [out, setOut] = useState(null);
  function params0() { return ''; }
  const check = async () => {
    const local = (await Store.getCerts()).find(c => c.certificateId === id.trim());
    if (local) { setOut({ ok: true, ...local }); return; }
    try { const r = await fetch(`${BACKEND_URL}/api/certificates/${id.trim()}`); if (r.ok) { const j = await r.json(); setOut({ ok: true, ...j }); } else setOut({ ok: false }); }
    catch { setOut({ ok: false, offline: true }); }
  };
  return <View style={s.pad}><Text style={s.h2}>{L('verify_title')}</Text>
    <TextInput style={s.inp} value={id} onChangeText={setId} placeholder="SVAR-123456" autoCapitalize="characters" />
    <BigBtn title="Verify" color={C.green} onPress={check} />
    {out && (out.ok ? <Card><Text style={{ fontSize: 22 }}>✅ {L('valid_cert')}</Text><Text>Worker: {out.workerName}{'\n'}Training: {out.moduleName}{'\n'}Score: {out.score}%{'\n'}ID: {out.certificateId}</Text></Card>
      : <Card><Text style={{ fontSize: 22 }}>❌ {L('invalid_cert')}</Text></Card>)}
    <BigBtn title="← Back" color={C.navy} onPress={() => go('dashboard')} />
  </View>;
}
function Settings({ L, lang, saveLang, go, worker, setWorker }) {
  return <ScrollView style={s.pad}><Text style={s.h2}>⚙️ {L('settings')}</Text>
    <Text style={s.lbl}>{L('select_language')}</Text>
    {LANGS.map(l => <TouchableOpacity key={l.code} onPress={() => saveLang(l.code)} style={[s.langOpt, lang === l.code && s.langSel]}><Text>{l.label}</Text></TouchableOpacity>)}
    <Text style={s.lbl}>Backend: {BACKEND_URL}</Text>
    <BigBtn title="Sync now" color={C.green} onPress={async () => { const r = await trySync(); Alert.alert('Sync', `Synced ${r.synced}, online=${r.online}`); }} />
    <BigBtn title="Logout / Reset" color={C.red} onPress={async () => { await AsyncStorage.clear(); setWorker(null); go('onboarding'); }} />
    <BigBtn title="← Back" color={C.navy} onPress={() => go(worker ? 'dashboard' : 'onboarding')} />
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  top: { backgroundColor: C.navy, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topT: { color: '#fff', fontWeight: '900', fontSize: 18 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  pad: { flex: 1, padding: 18 },
  h1: { fontSize: 30, fontWeight: '900', color: C.navy, textAlign: 'center' },
  h2: { fontSize: 24, fontWeight: '800', color: C.navy, marginVertical: 10 },
  sub: { fontSize: 16, textAlign: 'center', color: '#333' }, sub2: { color: '#666' },
  btn: { padding: 18, borderRadius: 14, marginVertical: 8, minHeight: 60, justifyContent: 'center', width: '100%' },
  btnT: { color: '#fff', fontWeight: '900', fontSize: 18, textAlign: 'center' },
  card: { backgroundColor: '#fff', padding: 14, borderRadius: 12, marginVertical: 8, elevation: 2 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeT: { color: '#fff', fontWeight: '800', fontSize: 12 },
  bar: { height: 14, backgroundColor: '#ddd', borderRadius: 7, marginTop: 8 }, barFill: { height: 14, backgroundColor: C.green, borderRadius: 7 },
  mod: { flexDirection: 'row', backgroundColor: '#fff', padding: 14, borderRadius: 12, marginVertical: 6, alignItems: 'center', gap: 12 },
  modT: { fontWeight: '800', fontSize: 16 },
  lbl: { fontWeight: '700', marginTop: 10 }, inp: { backgroundColor: '#fff', borderRadius: 10, padding: 14, fontSize: 17, marginTop: 4, borderWidth: 1, borderColor: '#ccc' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }, row2: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  chip: { padding: 12, borderRadius: 20, backgroundColor: '#eee' }, chipSel: { backgroundColor: C.navy }, chipT: {}, chipTsel: { color: '#fff', fontWeight: '700' },
  langOpt: { backgroundColor: '#fff', padding: 18, borderRadius: 12, marginVertical: 6, flexDirection: 'row', justifyContent: 'space-between' }, langSel: { borderWidth: 3, borderColor: C.saffron },
  langT: { fontSize: 18, fontWeight: '700' },
  arHead: { backgroundColor: '#000', padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, arHeadT: { color: '#0F0', fontWeight: '800' },
  arSpace: { flex: 1, padding: 16, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  marker: { backgroundColor: 'rgba(255,255,255,0.92)', padding: 14, borderRadius: 14, alignItems: 'center', minWidth: 110, borderWidth: 3, borderColor: C.yellow },
  markerT: { fontWeight: '900' }, markerS: { fontSize: 12 },
  msgBar: { backgroundColor: C.navy, padding: 14 }, msgT: { color: '#fff', fontSize: 16, textAlign: 'center' },
  taskT: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  extBody: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 14, padding: 16, gap: 10 },
  pin: { backgroundColor: '#FFC107', borderRadius: 24, padding: 8, borderWidth: 2, borderColor: '#fff' },
  smokeZone: { backgroundColor: 'rgba(120,120,120,0.85)', borderRadius: 10, padding: 10, marginVertical: 4, minWidth: 260, alignItems: 'center' },
  flameTop: { backgroundColor: 'rgba(217,45,32,0.85)', borderRadius: 10, padding: 8, marginVertical: 4, minWidth: 260, alignItems: 'center' },
  flameBase: { backgroundColor: 'rgba(14,124,62,0.92)', borderRadius: 10, padding: 14, marginVertical: 4, minWidth: 260, alignItems: 'center', borderWidth: 3, borderColor: '#FFC107' },
  sweepZone: { backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 14, marginTop: 10, width: '100%', borderWidth: 2, borderColor: C.yellow },
  routeA: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginVertical: 6, borderWidth: 3, borderColor: C.red },
  routeB: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginVertical: 6, borderWidth: 3, borderColor: C.green },
  opt: { backgroundColor: '#fff', padding: 18, borderRadius: 12, marginVertical: 6 }, optT: { fontSize: 18 },
  seq: { backgroundColor: '#fff', padding: 16, borderRadius: 10, marginVertical: 5 },
  obj: { fontWeight: '800', marginBottom: 8 },
  cert: { backgroundColor: '#FFFEF5', borderWidth: 4, borderColor: C.saffron, borderRadius: 14, padding: 20, alignItems: 'center' },
  certH: { fontSize: 24, fontWeight: '900', color: C.navy }, certN: { fontSize: 22, fontWeight: '800', marginVertical: 6 },
  discl: { backgroundColor: '#FFF3CD', padding: 8 }, disclT: { fontSize: 11, color: '#664D03', textAlign: 'center' },
});
