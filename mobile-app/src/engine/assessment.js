// Reusable assessment engine. No duplication between modules.
export const PASS_PCT = 70;
export const POINTS_PER_Q = 10;

export const ASSESSMENTS = {
  fire: [
    { id: 'f1', type: 'mcq', q: 'First action when fire is detected?', options: ['Raise alarm', 'Run', 'Hide', 'Do nothing'], answer: 0, explain: 'Raising the alarm alerts everyone.' },
    { id: 'f2', type: 'mcq', q: 'Which extinguisher for electrical fire in this scenario?', options: ['Water', 'ABC Dry Powder / CO₂', 'Sand only', 'Wet cloth'], answer: 1, explain: 'ABC/CO₂ is scenario-correct. Follow plant chart in real life.' },
    { id: 'f3', type: 'mcq', q: 'Exit near fire/smoke is…', options: ['Safe', 'Unsafe — choose alternate exit', 'Fastest so use it', 'Use lift'], answer: 1, explain: 'Avoid fire-adjacent exits; use marked safe route.' },
    { id: 'f4', type: 'mcq', q: 'After alarm, you should…', options: ['Alert others & move to exit', 'Collect belongings', 'Use lift', 'Re-enter for tools'], answer: 0, explain: 'Alert others, leave belongings, never use lift.' },
    { id: 'f5', type: 'mcq', q: 'Assembly point is for…', options: ['Headcount & safety', 'Tea break', 'Parking', 'Storage'], answer: 0, explain: 'Report to assembly point for headcount.' },
    { id: 'f6', type: 'mcq', q: 'If clothes catch fire?', options: ['Stop-Drop-Roll', 'Run fast', 'Pour petrol', 'Fan flames'], answer: 0, explain: 'Stop, drop and roll.' },
    { id: 'f7', type: 'mcq', q: 'Correct evacuation order?', options: ['Alarm→Alert→Exit→Assembly', 'Exit→Alarm→Assembly', 'Assembly→Alarm→Exit', 'Alert→Assembly→Alarm'], answer: 0, explain: 'Alarm first, then alert, exit, assembly.' },
    { id: 'f8', type: 'mcq', q: 'Smoke-filled corridor: you…', options: ['Stay low & follow arrows', 'Stand tall & run', 'Open all doors', 'Wait inside'], answer: 0, explain: 'Stay low, follow safe-route arrows.' },
    { id: 'f9', type: 'mcq', q: 'Who to inform after reaching assembly?', options: ['Safety marshal / supervisor', 'No one', 'Friends only', 'Media'], answer: 0, explain: 'Report to marshal for headcount.' },
    { id: 'f10', type: 'mcq', q: 'Training simulators are…', options: ['Practice only, follow real SOPs in emergency', 'Same as real fire', 'To test real fire', 'Optional fun'], answer: 0, explain: 'Simulation ≠ real emergency. Follow approved SOPs.' },
  ],
  gas: [
    { id: 'g1', type: 'mcq', q: 'Red zone means…', options: ['Gas hazard — do not enter', 'Safe picnic spot', 'Storage', 'Rest area'], answer: 0, explain: 'Red = hazard zone.' },
    { id: 'g2', type: 'mcq', q: 'Required PPE for suspected gas leak?', options: ['Respiratory protection', 'Sunglasses', 'Sandals', 'No PPE'], answer: 0, explain: 'Respiratory protection + helmet per SOP.' },
    { id: 'g3', type: 'mcq', q: 'Should a worker enter a confined space alone?', options: ['Yes', 'No'], answer: 1, explain: 'No — buddy system mandatory.' },
    { id: 'g4', type: 'mcq', q: 'Unsafe action?', options: ['Entering alone without communication', 'Checking per procedure', 'Wearing PPE', 'Keeping attendant outside'], answer: 0, explain: 'Entering alone is unsafe.' },
    { id: 'g5', type: 'mcq', q: 'First response to suspected leak?', options: ['Alert & evacuate, inform supervisor', 'Light match to check', 'Ignore smell', 'Enter to investigate alone'], answer: 0, explain: 'Alert, evacuate, inform — never ignite/test alone.' },
    { id: 'g6', type: 'mcq', q: 'Buddy system needs…', options: ['Attendant outside + comms check', 'Two people inside together only', 'Nobody outside', 'Phone switched off'], answer: 0, explain: 'Attendant outside with communication.' },
  ],
};

export function grade(moduleId, answers) {
  const qs = ASSESSMENTS[moduleId];
  let correct = 0;
  const detail = qs.map((q, i) => {
    const ok = answers[i] === q.answer;
    if (ok) correct++;
    return { qid: q.id, user: answers[i], correctAnswer: q.answer, ok };
  });
  const score = correct * POINTS_PER_Q;
  const max = qs.length * POINTS_PER_Q;
  const pct = Math.round((score / max) * 100);
  return { correct, total: qs.length, score, max, pct, passed: pct >= PASS_PCT, detail };
}
