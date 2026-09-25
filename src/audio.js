/**
 * Audio: recorded phonemes (public/audio/phonemes/*.mp3) for single sounds,
 * and the device's speech voice for whole words, sentences and questions.
 *
 * A British English voice is preferred, to match the workbooks. Everything
 * respects the 🔊 / 🔇 switch (store.prefs.sound).
 */

import { store } from './store.js';
import { PHONEME_FILES } from './phonemes.js';

const BASE = import.meta.env.BASE_URL;
const clips = new Map();
let playing = null;
let voice = null;
let speakGen = 0;

export const soundOn = () => store.prefs.sound !== false;

/** Load the clips for these keys ahead of time so the first tap is instant. */
export function preload(keys) {
  for (const k of keys) if (k && PHONEME_FILES.has(k) && !clips.has(k)) clip(k);
}

function clip(key) {
  let a = clips.get(key);
  if (!a) {
    a = new Audio(`${BASE}audio/phonemes/${key}.mp3`);
    a.preload = 'auto';
    clips.set(key, a);
  }
  return a;
}

/** Play one phoneme recording. Resolves when it finishes (or fails). */
export function playSound(key) {
  if (!soundOn() || !key || !PHONEME_FILES.has(key)) return Promise.resolve();
  stopAudio();
  const a = clip(key);
  playing = a;
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(guard);
      a.removeEventListener('ended', done);
      a.removeEventListener('error', done);
      resolve();
    };
    const guard = setTimeout(done, 3000);
    a.addEventListener('ended', done);
    a.addEventListener('error', done);
    try {
      a.currentTime = 0;
      const p = a.play();
      if (p?.catch) p.catch(done);
    } catch {
      done();
    }
  });
}

/** Play a sequence of phonemes with a short gap between them. */
export async function playSounds(keys, gap = 120) {
  for (const k of keys.filter(Boolean)) {
    await playSound(k);
    await new Promise((r) => setTimeout(r, gap));
  }
}

// ── Speech ────────────────────────────────────────────────────────────────

function pickVoice() {
  const all = globalThis.speechSynthesis?.getVoices?.() ?? [];
  if (!all.length) return null;
  const en = all.filter((v) => /^en/i.test(v.lang));
  const gb = en.filter((v) => /en[-_]GB/i.test(v.lang));
  const good = (v) => /natural|neural|online|enhanced|premium|google/i.test(v.name);
  const female = (v) => /female|sonia|libby|hazel|kate|serena|susan|emma|amy|olivia|jenny|aria|samantha|karen|moira/i.test(v.name);
  return (
    gb.find((v) => good(v) && female(v)) ??
    gb.find(female) ??
    gb.find(good) ??
    gb[0] ??
    en.find(good) ??
    en[0] ??
    all[0]
  );
}

if (globalThis.speechSynthesis) {
  voice = pickVoice();
  speechSynthesis.addEventListener?.('voiceschanged', () => (voice = pickVoice()));
}

export const canSpeak = () => Boolean(globalThis.speechSynthesis);

/**
 * Speak text with the device voice.
 * @param {string} text
 * @param {{rate?:number, onWord?:(charIndex:number)=>void}} [opts]
 * @returns {Promise<boolean>} true if it finished, false if stopped or unavailable
 */
export function say(text, { rate = 0.85, onWord } = {}) {
  if (!soundOn() || !canSpeak() || !text.trim()) return Promise.resolve(false);
  stopAudio();
  const gen = ++speakGen;
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.pitch = 1.05;
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-GB';
    let finished = false;
    const end = (ok) => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      clearInterval(resume);
      resolve(ok && gen === speakGen);
    };
    u.onend = () => end(true);
    u.onerror = () => end(false);
    if (onWord) u.onboundary = (e) => e.name !== 'sentence' && onWord(e.charIndex);
    // Some browsers never fire onend; never leave the app waiting forever.
    const guard = setTimeout(() => end(true), Math.max(2500, (text.length * 90) / rate) + 1500);
    // Safari pauses speech when focus changes; keep it going.
    const resume = setInterval(() => {
      if (speechSynthesis.paused) speechSynthesis.resume();
    }, 300);
    // A short gap after cancel() stops the first sound being clipped.
    setTimeout(() => {
      if (gen !== speakGen) return end(false);
      speechSynthesis.speak(u);
    }, 60);
  });
}

/** Stop any sound or speech that is playing. */
export function stopAudio() {
  speakGen++;
  if (playing) {
    try {
      playing.pause();
    } catch {
      /* ignore */
    }
    playing = null;
  }
  try {
    globalThis.speechSynthesis?.cancel();
  } catch {
    /* ignore */
  }
}
