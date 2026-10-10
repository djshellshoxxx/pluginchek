// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Bundled plugin database snapshot (F3). Compact rows are expanded by buildSnapshot().
// Row: [id, name, vendor, category, price, aliases, alternatives, platforms, summary]
// price: free | freemium | paid. platforms: letters w=Windows m=macOS l=Linux (omit when unsure).
// Only facts the maintainers are confident about belong here; unknown values stay empty so the UI says "unknown".
const ROWS = [
  ['fabfilter-pro-q', 'Pro-Q', 'FabFilter', 'EQ', 'paid', ['FabFilter Pro-Q 3', 'Pro-Q 3', 'Pro-Q3', 'FabFilter Pro-Q 4', 'Pro-Q 4'], ['tdr-nova', 'tdr-vos-slick-eq'], 'wm', 'Parametric equalizer for surgical correction, tone shaping and spectrum-aware EQ work.'],
  ['fabfilter-pro-c', 'Pro-C', 'FabFilter', 'Compressor', 'paid', ['FabFilter Pro-C 2', 'Pro-C 2', 'Pro-C2'], ['tdr-kotelnikov'], 'wm', 'Dynamics compressor for level control, punch, transient shaping and side-chain work.'],
  ['fabfilter-pro-l', 'Pro-L', 'FabFilter', 'Limiter', 'paid', ['FabFilter Pro-L 2', 'Pro-L 2', 'Pro-L2'], ['limiter-no6'], 'wm', 'Brickwall limiter for peak control and final loudness.'],
  ['fabfilter-pro-r', 'Pro-R', 'FabFilter', 'Reverb', 'paid', ['FabFilter Pro-R 2', 'Pro-R 2'], ['valhalla-supermassive', 'dragonfly-reverb'], 'wm', 'Algorithmic reverb for room, ambience and spatial effects.'],
  ['fabfilter-pro-mb', 'Pro-MB', 'FabFilter', 'Compressor', 'paid', ['FabFilter Pro-MB'], ['tdr-nova'], 'wm', 'Multiband dynamics processor.'],
  ['fabfilter-pro-ds', 'Pro-DS', 'FabFilter', 'Dynamics', 'paid', ['FabFilter Pro-DS'], [], 'wm', 'De-esser for sibilance control.'],
  ['fabfilter-saturn', 'Saturn', 'FabFilter', 'Distortion / Saturation', 'paid', ['FabFilter Saturn 2', 'Saturn 2'], [], 'wm', 'Multiband distortion and saturation.'],
  ['fabfilter-timeless', 'Timeless', 'FabFilter', 'Delay', 'paid', ['FabFilter Timeless 3', 'Timeless 3'], ['valhalla-freq-echo'], 'wm', 'Tape-style delay with modulation and filtering.'],
  ['valhalla-supermassive', 'ValhallaSupermassive', 'Valhalla DSP', 'Reverb', 'free', ['Valhalla Supermassive', 'Supermassive'], ['dragonfly-reverb'], 'wm', 'Free large-space reverb and delay.'],
  ['valhalla-vintageverb', 'ValhallaVintageVerb', 'Valhalla DSP', 'Reverb', 'paid', ['Valhalla VintageVerb', 'VintageVerb'], ['valhalla-supermassive', 'dragonfly-reverb'], 'wml', 'Classic digital reverb emulations.'],
  ['valhalla-room', 'ValhallaRoom', 'Valhalla DSP', 'Reverb', 'paid', ['Valhalla Room'], ['valhalla-supermassive', 'dragonfly-reverb'], 'wm', 'Algorithmic room and hall reverb.'],
  ['valhalla-shimmer', 'ValhallaShimmer', 'Valhalla DSP', 'Reverb', 'paid', ['Valhalla Shimmer'], ['valhalla-supermassive'], 'wm', 'Shimmer reverb with pitch-shifted feedback.'],
  ['valhalla-freq-echo', 'ValhallaFreqEcho', 'Valhalla DSP', 'Delay', 'free', ['Valhalla FreqEcho', 'FreqEcho'], [], 'wm', 'Free frequency-shifting echo.'],
  ['dragonfly-reverb', 'Dragonfly Reverb', 'Michael Willis', 'Reverb', 'free', ['Dragonfly Hall Reverb', 'Dragonfly Room Reverb', 'DragonflyHallReverb'], ['valhalla-supermassive'], 'wml', 'Free open-source reverb collection.'],
  ['tdr-nova', 'TDR Nova', 'Tokyo Dawn Labs', 'EQ', 'free', ['Nova', 'TDR Nova GE'], ['tdr-vos-slick-eq'], 'wml', 'Free parallel dynamic equalizer.'],
  ['tdr-kotelnikov', 'TDR Kotelnikov', 'Tokyo Dawn Labs', 'Compressor', 'free', ['Kotelnikov'], [], 'wml', 'Free mastering-grade compressor.'],
  ['tdr-vos-slick-eq', 'VOS SlickEQ', 'Tokyo Dawn Labs', 'EQ', 'free', ['SlickEQ', 'TDR SlickEQ'], ['tdr-nova'], 'wml', 'Free colourful EQ with saturation.'],
  ['limiter-no6', 'Limiter No6', 'Vladg/sound', 'Limiter', 'free', ['LimiterNo6'], [], 'wm', 'Free transparent limiter.'],
  ['serum', 'Serum', 'Xfer Records', 'Instrument / Synth', 'paid', ['Xfer Serum', 'Serum_x64'], ['vital', 'surge-xt'], 'wm', 'Wavetable synthesizer with a visual workflow.'],
  ['vital', 'Vital', 'Vital Audio', 'Instrument / Synth', 'freemium', ['Vital Synth'], ['surge-xt'], 'wml', 'Spectral wavetable synthesizer with a free tier.'],
  ['surge-xt', 'Surge XT', 'Surge Synth Team', 'Instrument / Synth', 'free', ['Surge', 'Surge XT Effects'], ['vital'], 'wml', 'Free open-source hybrid synthesizer.'],
  ['massive', 'Massive', 'Native Instruments', 'Instrument / Synth', 'paid', ['NI Massive'], ['vital', 'surge-xt'], 'wm', 'Wavetable synthesizer (Massive X is the successor).'],
  ['massive-x', 'Massive X', 'Native Instruments', 'Instrument / Synth', 'paid', ['NI Massive X'], ['vital', 'surge-xt'], 'wm', 'Wavetable synthesizer.'],
  ['kontakt', 'Kontakt', 'Native Instruments', 'Sampler / Instrument', 'paid', ['NI Kontakt', 'Kontakt 7'], [], 'wm', 'Sampler platform that hosts third-party libraries.'],
  ['reaktor', 'Reaktor', 'Native Instruments', 'Instrument / Effect', 'paid', ['Reaktor 6', 'NI Reaktor'], [], 'wm', 'Modular environment for instruments and effects.'],
  ['guitar-rig', 'Guitar Rig', 'Native Instruments', 'Amp / Guitar', 'paid', ['Guitar Rig 6', 'Guitar Rig 7'], [], 'wm', 'Guitar/bass amp, cabinet and multi-effect processor.'],
  ['ozone', 'Ozone', 'iZotope', 'Mixing / Utility', 'paid', ['iZotope Ozone', 'Ozone 9', 'Ozone 10', 'Ozone 11'], [], 'wm', 'Mastering suite (EQ, dynamics, imager, maximizer).'],
  ['neutron', 'Neutron', 'iZotope', 'Mixing / Utility', 'paid', ['iZotope Neutron', 'Neutron 4'], [], 'wm', 'Mixing suite with assistant features.'],
  ['rx', 'RX', 'iZotope', 'Utility', 'paid', ['iZotope RX', 'RX 10'], [], 'wm', 'Audio repair and restoration toolkit.'],
  ['decapitator', 'Decapitator', 'Soundtoys', 'Distortion / Saturation', 'paid', ['SoundToys Decapitator'], [], 'wm', 'Analog-style saturation and distortion.'],
  ['echoboy', 'EchoBoy', 'Soundtoys', 'Delay', 'paid', ['SoundToys EchoBoy'], ['valhalla-freq-echo'], 'wm', 'Character delay and echo processor.'],
  ['little-alterboy', 'Little AlterBoy', 'Soundtoys', 'Pitch / Voice', 'paid', ['SoundToys Little AlterBoy'], [], 'wm', 'Pitch and formant manipulation.'],
  ['melodyne', 'Melodyne', 'Celemony', 'Pitch / Time', 'paid', ['Melodyne 5', 'Celemony Melodyne'], [], 'wm', 'Note-level pitch and timing editor.'],
  ['auto-tune', 'Auto-Tune', 'Antares', 'Pitch / Voice', 'paid', ['Antares Auto-Tune', 'Autotune'], [], 'wm', 'Pitch correction and vocal tuning.'],
  ['sylenth1', 'Sylenth1', 'LennarDigital', 'Instrument / Synth', 'paid', ['Sylenth'], ['vital', 'surge-xt'], 'wm', 'Virtual-analog synthesizer.'],
  ['omnisphere', 'Omnisphere', 'Spectrasonics', 'Instrument / Synth', 'paid', ['Spectrasonics Omnisphere'], [], 'wm', 'Hybrid sample/synthesis instrument.'],
  ['superior-drummer', 'Superior Drummer', 'Toontrack', 'Drum Instrument', 'paid', ['Superior Drummer 3'], [], 'wm', 'Sample-based drum instrument and mixer.'],
  ['addictive-drums', 'Addictive Drums', 'XLN Audio', 'Drum Instrument', 'paid', ['XLN Addictive Drums', 'Addictive Drums 2'], [], 'wm', 'Sample-based drum instrument.'],
  ['amplitube', 'AmpliTube', 'IK Multimedia', 'Amp / Guitar', 'paid', ['AmpliTube 5', 'IK AmpliTube'], [], 'wm', 'Guitar/bass amp and effects modeling.'],
  ['reaeq', 'ReaEQ', 'Cockos', 'EQ', 'free', ['ReaEQ (Cockos)'], ['tdr-nova'], 'wml', 'REAPER bundled parametric EQ.'],
  ['reacomp', 'ReaComp', 'Cockos', 'Compressor', 'free', ['ReaComp (Cockos)'], ['tdr-kotelnikov'], 'wml', 'REAPER bundled compressor.'],
  ['readelay', 'ReaDelay', 'Cockos', 'Delay', 'free', ['ReaDelay (Cockos)'], [], 'wml', 'REAPER bundled delay.'],
  ['reaverb', 'ReaVerbate', 'Cockos', 'Reverb', 'free', ['ReaVerb', 'ReaVerb (Cockos)'], ['dragonfly-reverb'], 'wml', 'REAPER bundled reverb.'],
  ['reasynth', 'ReaSynth', 'Cockos', 'Instrument / Synth', 'free', ['ReaSynth (Cockos)'], ['surge-xt'], 'wml', 'REAPER bundled simple synthesizer.'],
];
const PLAT = { w: 'win', m: 'mac', l: 'linux' };

export function buildSnapshot(rows = ROWS) {
  const plugins = rows.map(([id, name, vendor, category, price, aliases, alternatives, plat, summary]) => ({
    id, name, vendor, category, price, aliases, alternatives: alternatives.filter(a => rows.some(r => r[0] === a)), summary,
    ids: [], formats: [], platforms: plat ? Object.fromEntries(Object.entries(PLAT).map(([k, v]) => [v, plat.includes(k)])) : {},
    links: [], stock: false,
  }));
  return { version: 1, updated: '2026-10-10', plugins };
}
export const SNAPSHOT = buildSnapshot();
