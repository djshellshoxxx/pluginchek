// PluginChek™
// Copyright © 2026 Sheldon Davidson.
// Licensed under the MIT License. See LICENSE.
// SPDX-License-Identifier: MIT

// Ableton Live (.als) structured parser. Element names follow Live 10-12 project XML (VERIFY against fixtures).
import { scanXml } from '../core/xml.js';

const TRACKS = new Set(['AudioTrack', 'MidiTrack', 'ReturnTrack', 'MasterTrack', 'GroupTrack']);
const INFO = { VstPluginInfo: 'VST2', Vst3PluginInfo: 'VST3', AuPluginInfo: 'AU' };

// DAW built-in devices: element tag -> [display name, category]
export const STOCK = {
  Compressor2: ['Compressor', 'Compressor'], GlueCompressor: ['Glue Compressor', 'Compressor'], Limiter: ['Limiter', 'Limiter'],
  Eq8: ['EQ Eight', 'EQ'], FilterEQ3: ['EQ Three', 'EQ'], Reverb: ['Reverb', 'Reverb'], Hybrid: ['Hybrid Reverb', 'Reverb'],
  Delay: ['Simple Delay', 'Delay'], PingPongDelay: ['Ping Pong Delay', 'Delay'], Echo: ['Echo', 'Delay'],
  AutoFilter: ['Auto Filter', 'Modulation'], Gate: ['Gate', 'Dynamics'], MultibandDynamics: ['Multiband Dynamics', 'Dynamics'],
  Saturator: ['Saturator', 'Distortion / Saturation'], Erosion: ['Erosion', 'Distortion / Saturation'], Redux2: ['Redux', 'Distortion / Saturation'],
  Chorus2: ['Chorus-Ensemble', 'Modulation'], Phaser: ['Phaser', 'Modulation'], Flanger: ['Flanger', 'Modulation'], AutoPan: ['Auto Pan', 'Modulation'],
  StereoGain: ['Utility', 'Utility'], Tuner: ['Tuner', 'Analyzer'], Spectrum: ['Spectrum', 'Analyzer'], Vocoder: ['Vocoder', 'Pitch / Voice'],
  Operator: ['Operator', 'Instrument / Synth'], Wavetable: ['Wavetable', 'Instrument / Synth'], UltraAnalog: ['Analog', 'Instrument / Synth'],
  OriginalSimpler: ['Simpler', 'Sampler / Instrument'], MultiSampler: ['Sampler', 'Sampler / Instrument'],
  DrumGroupDevice: ['Drum Rack', 'Drum Instrument'], InstrumentImpulse: ['Impulse', 'Drum Instrument'],
};

const hex32 = n => (Number(n) >>> 0).toString(16).padStart(8, '0').toUpperCase();

export const ableton = {
  id: 'ableton',
  canParse: (name, { text }) => (/\.als$/i.test(name) ? 2 : 0) || (text && /<Ableton\b/.test(text.slice(0, 2000)) ? 2 : 0),

  async parse({ name, text }) {
    const findings = [], media = [], notes = [];
    let track = null, trackName = '', cur = null, ref = null, version = '';
    const emit = f => findings.push({ daw: 'Ableton Live', sources: [name], confidence: f.pluginId ? 'high' : 'medium', occurrences: 1, tracks: trackName ? [trackName] : [], ...f });

    scanXml(text, {
      open(tag, a, stack) {
        const parent = stack[stack.length - 1];
        if (tag === 'Ableton' && a.Creator) version = a.Creator;
        if (TRACKS.has(tag)) { track = tag; trackName = ''; }
        else if (tag === 'EffectiveName' && parent === 'Name' && track && !trackName) trackName = a.Value || '';
        if (INFO[tag]) { cur = { tag, fmt: INFO[tag], f: {}, uid: [] }; return; }
        if (cur) {
          const m = /^Fields\.(\d)$/.exec(tag);
          if (m && a.Value !== undefined) cur.uid[+m[1]] = a.Value;
          else if (a.Value !== undefined && !(tag in cur.f)) cur.f[tag] = a.Value;
          return;
        }
        if (STOCK[tag] && a.Id !== undefined && parent === 'Devices') {
          const [n, category] = STOCK[tag];
          emit({ name: n, kind: 'stock', category, format: 'Unknown', confidence: 'high', evidence: [`<${tag}> device`], explanation: `Built-in Ableton Live device (${n}).` });
        }
        if (tag === 'FileRef') ref = { rel: '', abs: '' };
        else if (ref && tag === 'RelativePath' && a.Value) ref.rel = a.Value;
        else if (ref && tag === 'Path' && a.Value) ref.abs = a.Value;
      },
      close(tag) {
        if (TRACKS.has(tag)) { track = null; trackName = ''; }
        if (cur && tag === cur.tag) {
          const { f, fmt, uid } = cur;
          const pname = (fmt === 'VST2' ? f.PlugName : f.Name) || '';
          if (pname) {
            let pluginId = null;
            if (fmt === 'VST2' && f.UniqueId && f.UniqueId !== '0') pluginId = { type: 'vst2-fourcc', value: String(f.UniqueId) };
            if (fmt === 'VST3' && uid.length === 4 && uid.every(v => v !== undefined)) pluginId = { type: 'vst3-cid', value: uid.map(hex32).join('') };
            emit({ name: pname, vendor: f.Manufacturer || '', format: fmt, pluginId, kind: 'plugin',
              evidence: [`Ableton <${cur.tag}> ${fmt === 'VST2' ? 'PlugName' : 'Name'}="${pname}"${pluginId ? ` id=${pluginId.value}` : ''}`] });
          }
          cur = null;
        }
        if (tag === 'FileRef' && ref) {
          const p = ref.rel || ref.abs;
          if (p) media.push({ kind: /\.(adg|adv|fxp|fxb|vstpreset|aupreset)$/i.test(p) ? 'preset' : 'audio', path: p, absPath: ref.abs || '', relPath: ref.rel || '', resolvedPath: null, status: 'unchecked', source: name, occurrences: 1 });
          ref = null;
        }
      },
    });
    notes.push(`Ableton project parsed structurally${version ? ` (${version})` : ''}.`);
    return { findings, media, notes, meta: { version } };
  },
};
