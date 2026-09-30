// 効果音と BGM の合成（Web Audio の OfflineAudioContext）。乱数は固定シード。同じ設定なら毎回同じ音になる。
// Suno など外部で作った BGM に差し替える場合は、scripts/render_staff.mjs が audio/bgm.* を優先して使う。

const SR = 44100;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

export async function renderStaffAudio({ duration, cues, livePiano, bgmPlan }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * duration), SR);
  const rnd = mulberry(20260930);

  // ---- ノイズ・リバーブ ----
  const noiseBuf = ctx.createBuffer(1, SR * 4, SR);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
  }
  const irLen = Math.floor(SR * 2.2);
  const ir = ctx.createBuffer(2, irLen, SR);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < irLen; i++) d[i] = (rnd() * 2 - 1) * Math.exp((-3.2 * i) / irLen) * (i < 800 ? i / 800 : 1);
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const revGain = ctx.createGain();
  revGain.gain.value = 0.32;
  reverb.connect(revGain);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(ctx.destination);
  revGain.connect(master);

  const bgmBus = ctx.createGain();
  bgmBus.gain.value = 0;
  bgmBus.connect(master);
  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);

  const send = (node, amt) => {
    const g = ctx.createGain();
    g.gain.value = amt;
    node.connect(g);
    g.connect(reverb);
  };
  const env = (g, t, a, peak, dec, tail = 0.02) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec + tail);
  };
  const noise = (t, dur) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.start(t, rnd() * 2, dur);
    return s;
  };
  const osc = (type, f, t, dur) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(t + dur);
    return o;
  };

  // ---- 楽器 ----
  const pianoNote = (bus, t, midi, dur, vel = 0.5, wet = 0.5) => {
    const f = mtof(midi);
    const g = ctx.createGain();
    const partials = [1, 0.55, 0.3, 0.16, 0.09, 0.05];
    const decay = Math.min(dur + 1.2, 3.2) * (midi < 60 ? 1.2 : 0.9);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.006);
    g.gain.exponentialRampToValueAtTime(vel * 0.06, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    partials.forEach((a, i) => {
      const o = osc('sine', f * (i + 1) * (1 + i * i * 0.00035), t, decay + 0.1);
      const pg = ctx.createGain();
      pg.gain.value = a;
      o.connect(pg);
      pg.connect(g);
    });
    g.connect(bus);
    send(g, wet);
  };
  const pluck = (bus, t, midi, dur, vel = 0.3) => {
    const g = ctx.createGain();
    env(g, t, 0.004, vel * 0.2, dur);
    const o = osc('triangle', mtof(midi), t, dur + 0.1);
    o.connect(g);
    g.connect(bus);
    send(g, 0.35);
  };
  const pad = (bus, t, midis, dur, vel = 0.05) => {
    for (const m of midis) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.5);
      g.gain.setValueAtTime(vel, t + dur - 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
      for (const det of [-5, 5]) {
        const o = osc('sawtooth', mtof(m), t, dur + 0.6);
        o.detune.value = det;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        o.connect(lp);
        lp.connect(g);
      }
      g.connect(bus);
      send(g, 0.25);
    }
  };
  const bass = (bus, t, midi, dur) => {
    const g = ctx.createGain();
    env(g, t, 0.01, 0.22, dur * 0.9);
    const o = osc('sine', mtof(midi), t, dur + 0.1);
    o.connect(g);
    g.connect(bus);
  };
  const hat = (bus, t, vel = 0.02) => {
    const n = noise(t, 0.05);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    env(g, t, 0.001, vel, 0.03);
    n.connect(hp);
    hp.connect(g);
    g.connect(bus);
  };
  const kick = (bus, t, vel = 0.22) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    const g = ctx.createGain();
    env(g, t, 0.002, vel, 0.16);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + 0.3);
  };

  // ---- BGM（原作）：C - G - Am - F、96 BPM、10 秒ループ ----
  const bpm = bgmPlan.bpm;
  const beat = 60 / bpm;
  const chords = [
    { root: 36, tones: [60, 64, 67, 72] }, // C
    { root: 31, tones: [59, 62, 67, 71] }, // G
    { root: 33, tones: [57, 60, 64, 69] }, // Am
    { root: 29, tones: [57, 60, 65, 69] }, // F
  ];
  const lead = [
    // 4 小節ぶんの旋律（拍位置, midi, 拍長）
    [[0, 76, 1], [1, 79, 1], [2, 76, 1.5], [3.5, 74, 0.5]],
    [[0, 74, 1], [1, 71, 1], [2, 74, 1], [3, 79, 1]],
    [[0, 72, 1.5], [1.5, 76, 0.5], [2, 81, 1], [3, 76, 1]],
    [[0, 77, 1], [1, 76, 1], [2, 72, 1], [3, 74, 1]],
  ];
  const sceneDrive = bgmPlan.off ? [] : bgmPlan.sections; // [{from,to,vol,drums,arp,lead}]
  const bars = Math.ceil(duration / (beat * 4));
  for (let bar = 0; bar < bars; bar++) {
    const t0 = bar * beat * 4;
    const sec = sceneDrive.find((s) => t0 >= s.from && t0 < s.to);
    if (!sec || sec.vol <= 0) continue;
    const ch = chords[bar % 4];
    pad(bgmBus, t0, ch.tones.slice(0, 3), beat * 4, 0.04 * sec.vol);
    bass(bgmBus, t0, ch.root, beat * 2);
    bass(bgmBus, t0 + beat * 2, ch.root + (bar % 2 ? 7 : 0), beat * 2);
    if (sec.arp) for (let i = 0; i < 8; i++) pluck(bgmBus, t0 + i * beat * 0.5, ch.tones[[0, 1, 2, 3, 2, 1, 2, 3][i]] - 12 + 12, beat * 0.5, 0.26 * sec.vol);
    if (sec.lead) for (const [b, m, d] of lead[bar % 4]) pluck(bgmBus, t0 + b * beat, m, d * beat * 1.4, 0.4 * sec.vol);
    if (sec.drums) {
      for (let i = 0; i < 8; i++) hat(bgmBus, t0 + i * beat * 0.5, i % 2 ? 0.02 : 0.012);
      kick(bgmBus, t0, 0.2);
      kick(bgmBus, t0 + beat * 2, 0.16);
    }
  }
  // BGM の音量オートメーション（シーンごと）
  bgmBus.gain.setValueAtTime(0.0001, 0);
  for (const s of bgmPlan.bus) {
    bgmBus.gain.linearRampToValueAtTime(s.v, Math.max(0.01, s.t));
  }

  // ---- 生演奏（公演中）：ゆっくりした原作のピアノ（9小節＋終止和音）----
  {
    const lb = 0.9;
    const t0 = livePiano.from;
    const roots = [48, 45, 41, 43, 48, 45, 41, 43, 48]; // C Am F G C Am F G C（左手）
    const thirds = [4, 3, 4, 4, 4, 3, 4, 4, 4];
    const arp = [0, 7, 16, 7]; // 根音, 5度, 3度(上のオクターブ), 5度
    for (let b = 0; b < 9; b++) {
      for (let i = 0; i < 4; i++) {
        const off = arp[i] === 16 ? 12 + thirds[b] : arp[i];
        pianoNote(sfxBus, t0 + (b * 4 + i) * lb, roots[b] + off, lb * 1.6, 0.42, 0.55);
      }
    }
    const bars = [
      [[0, 76, 2], [2, 79, 1], [3, 76, 1]],
      [[0, 81, 1.5], [1.5, 79, 0.5], [2, 76, 2]],
      [[0, 77, 2], [2, 81, 1], [3, 79, 1]],
      [[0, 74, 2], [2, 71, 1], [3, 74, 1]],
      [[0, 79, 1], [1, 76, 1], [2, 79, 1], [3, 84, 1]],
      [[0, 81, 2], [2, 76, 1], [3, 72, 1]],
      [[0, 77, 1.5], [1.5, 79, 0.5], [2, 81, 2]],
      [[0, 79, 1], [1, 74, 1], [2, 71, 2]],
      [[0, 72, 4]],
    ];
    bars.forEach((notes, bi) => {
      for (const [b, m, d] of notes) pianoNote(sfxBus, t0 + (bi * 4 + b) * lb, m, d * lb, 0.62, 0.6);
    });
    // 終止和音
    for (const m of [48, 60, 64, 67, 72]) pianoNote(sfxBus, t0 + 36 * lb, m, 1.2, 0.5, 0.7);
  }

  // ---- 効果音 ----
  const fx = {
    whoosh(t) {
      const n = noise(t, 0.8);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.5);
      const g = ctx.createGain();
      env(g, t, 0.2, 0.22, 0.45);
      n.connect(bp);
      bp.connect(g);
      g.connect(sfxBus);
    },
    ding(t, c) {
      const f = [880, 1108.7, 1318.5][c.note || 0];
      const g = ctx.createGain();
      env(g, t, 0.003, 0.28, 0.9);
      for (const [mul, a] of [[1, 1], [2.01, 0.35], [3.98, 0.12]]) {
        const o = osc('sine', f * mul, t, 1.2);
        const og = ctx.createGain();
        og.gain.value = a;
        o.connect(og);
        og.connect(g);
      }
      g.connect(sfxBus);
      send(g, 0.4);
    },
    pop(t) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(220, t + 0.09);
      const g = ctx.createGain();
      env(g, t, 0.002, 0.3, 0.09);
      o.connect(g);
      g.connect(sfxBus);
      o.start(t);
      o.stop(t + 0.2);
    },
    steps(t, c) {
      const dur = c.dur || 3;
      const wet = 0.3 + (c.tail || 0) * 0.35;
      for (let k = 0, x = t; x < t + dur; k++, x += 0.52) {
        const n = noise(x, 0.09);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900 + (k % 2) * 200;
        const g = ctx.createGain();
        env(g, x, 0.004, 0.3 * (c.gain || 1) * (0.85 + rnd() * 0.3), 0.07);
        n.connect(lp);
        lp.connect(g);
        g.connect(sfxBus);
        send(g, wet);
        const th = osc('sine', 85 + (k % 2) * 12, x, 0.15);
        const tg = ctx.createGain();
        env(tg, x, 0.003, 0.22 * (c.gain || 1), 0.1);
        th.connect(tg);
        tg.connect(sfxBus);
        send(tg, wet * 0.6);
      }
    },
    chime17(t) {
      // ピンポンパンポン風の開場チャイム（原作）
      [[0, 880], [0.36, 659.3], [0.72, 784], [1.08, 523.3]].forEach(([dt, f]) => {
        const g = ctx.createGain();
        env(g, t + dt, 0.005, 0.32, 0.9);
        for (const [mul, a] of [[1, 1], [2, 0.3], [3, 0.1]]) {
          const o = osc('sine', f * mul, t + dt, 1.3);
          const og = ctx.createGain();
          og.gain.value = a;
          o.connect(og);
          og.connect(g);
        }
        g.connect(sfxBus);
        send(g, 0.45);
      });
    },
    door(t) {
      const o = osc('sine', 68, t, 0.4);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.25);
      const g = ctx.createGain();
      env(g, t, 0.004, 0.4, 0.22);
      o.connect(g);
      g.connect(sfxBus);
      const n = noise(t, 0.4);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const ng = ctx.createGain();
      env(ng, t, 0.005, 0.25, 0.22);
      n.connect(lp);
      lp.connect(ng);
      ng.connect(sfxBus);
      send(ng, 0.3);
      const cr = osc('sawtooth', 190, t - 0.35, 0.5);
      cr.frequency.linearRampToValueAtTime(140, t + 0.1);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 700;
      bp.Q.value = 6;
      const cg = ctx.createGain();
      env(cg, Math.max(0, t - 0.35), 0.1, 0.05, 0.3);
      cr.connect(bp);
      bp.connect(cg);
      cg.connect(sfxBus);
    },
    doorSoft(t) {
      // そっと開閉するドア：低い擦れ音だけ
      const n = noise(t, 0.8);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 420;
      bp.Q.value = 1.4;
      const g = ctx.createGain();
      env(g, t, 0.25, 0.09, 0.45);
      n.connect(bp);
      bp.connect(g);
      g.connect(sfxBus);
      send(g, 0.3);
      const th = osc('sine', 60, t + 0.7, 0.2);
      const tg = ctx.createGain();
      env(tg, t + 0.7, 0.01, 0.06, 0.12);
      th.connect(tg);
      tg.connect(sfxBus);
    },
    cloth(t) {
      // 布がふわっと落ちる音
      const n = noise(t, 0.9);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.7);
      const g = ctx.createGain();
      env(g, t, 0.08, 0.16, 0.6);
      n.connect(lp);
      lp.connect(g);
      g.connect(sfxBus);
      send(g, 0.2);
    },
    shh(t) {
      const n = noise(t, 1.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 4200;
      bp.Q.value = 0.9;
      const g = ctx.createGain();
      env(g, t, 0.25, 0.16, 0.7);
      n.connect(bp);
      bp.connect(g);
      g.connect(sfxBus);
    },
    murmur(t, c) {
      const dur = c.dur || 3;
      for (const [f1, f2, lfo, pan] of [[700, 1200, 5.1, -0.4], [520, 1500, 4.3, 0.4]]) {
        const n = noise(t, dur + 0.2);
        const b1 = ctx.createBiquadFilter();
        b1.type = 'bandpass';
        b1.frequency.value = f1;
        b1.Q.value = 4;
        const b2 = ctx.createBiquadFilter();
        b2.type = 'bandpass';
        b2.frequency.value = f2;
        b2.Q.value = 5;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.9, t + 0.15);
        g.gain.setValueAtTime(0.9, t + dur - 0.2);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        const am = ctx.createGain();
        am.gain.value = 0.5;
        const l = osc('sine', lfo, t, dur + 0.2);
        const lg = ctx.createGain();
        lg.gain.value = 0.5;
        l.connect(lg);
        lg.connect(am.gain);
        const out = ctx.createGain();
        out.gain.value = 0.32;
        const p = ctx.createStereoPanner();
        p.pan.value = pan;
        n.connect(b1);
        b1.connect(b2);
        b2.connect(am);
        am.connect(g);
        g.connect(out);
        out.connect(p);
        p.connect(sfxBus);
        send(out, 0.2);
      }
    },
    buzz(t) {
      // ぶぶーっ（不正解ブザー）
      [[0, 0.2], [0.26, 0.55]].forEach(([dt, d]) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + dt);
        g.gain.linearRampToValueAtTime(0.42, t + dt + 0.01);
        g.gain.setValueAtTime(0.42, t + dt + d - 0.03);
        g.gain.linearRampToValueAtTime(0.0001, t + dt + d);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        for (const [type, f] of [['square', 116], ['sawtooth', 118], ['square', 232]]) {
          const o = osc(type, f, t + dt, d + 0.05);
          const og = ctx.createGain();
          og.gain.value = type === 'square' && f > 200 ? 0.25 : 0.5;
          o.connect(og);
          og.connect(lp);
        }
        lp.connect(g);
        g.connect(sfxBus);
      });
    },
    applause(t, c) {
      const dur = c.dur || 3;
      const n = noise(t, dur + 0.3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2600;
      bp.Q.value = 0.6;
      const g = ctx.createGain();
      const N = Math.floor(dur * 90);
      const curve = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const sw = Math.min(1, u * 6) * Math.min(1, (1 - u) * 3);
        curve[i] = sw * (0.15 + rnd() * 0.85);
      }
      g.gain.setValueAtTime(0, t);
      g.gain.setValueCurveAtTime(curve, t, dur);
      const out = ctx.createGain();
      out.gain.value = 0.55;
      n.connect(bp);
      bp.connect(g);
      g.connect(out);
      out.connect(sfxBus);
      send(out, 0.25);
    },
    chime(t) {
      [[0, 1046.5], [0.18, 1318.5], [0.36, 1568]].forEach(([dt, f]) => {
        const g = ctx.createGain();
        env(g, t + dt, 0.004, 0.26, 1.6);
        for (const [mul, a] of [[1, 1], [2, 0.3], [3.01, 0.1]]) {
          const o = osc('sine', f * mul, t + dt, 2);
          const og = ctx.createGain();
          og.gain.value = a;
          o.connect(og);
          og.connect(g);
        }
        g.connect(sfxBus);
        send(g, 0.5);
      });
    },
  };
  for (const c of cues) if (fx[c.type]) fx[c.type](c.t, c);

  const buf = await ctx.startRendering();
  // Int16 のステレオ交互データにして返す
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const out = new Int16Array(L.length * 2);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const norm = peak > 0.95 ? 0.95 / peak : 1;
  for (let i = 0; i < L.length; i++) {
    out[2 * i] = Math.max(-1, Math.min(1, L[i] * norm)) * 32767;
    out[2 * i + 1] = Math.max(-1, Math.min(1, R[i] * norm)) * 32767;
  }
  let bin = '';
  const bytes = new Uint8Array(out.buffer);
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return { sampleRate: SR, channels: 2, peak, samples: L.length, base64: btoa(bin) };
}
