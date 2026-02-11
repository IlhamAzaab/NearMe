/**
 * Generate success-alert.wav - a pleasant success chime sound
 * Run: node generate-success-sound.js
 */

const fs = require("fs");
const path = require("path");

function generateSuccessChime() {
  const sampleRate = 44100;
  const duration = 1.2; // 1.2 seconds
  const numSamples = Math.floor(sampleRate * duration);
  const samples = new Float32Array(numSamples);

  // Three ascending notes for a pleasant chime: C5 → E5 → G5
  const notes = [
    { freq: 523.25, start: 0.0, end: 0.4, volume: 0.6 }, // C5
    { freq: 659.25, start: 0.15, end: 0.55, volume: 0.5 }, // E5
    { freq: 783.99, start: 0.3, end: 0.8, volume: 0.45 }, // G5
    { freq: 1046.5, start: 0.45, end: 1.2, volume: 0.3 }, // C6 (high octave)
  ];

  for (const note of notes) {
    const startSample = Math.floor(note.start * sampleRate);
    const endSample = Math.floor(note.end * sampleRate);
    const noteDuration = endSample - startSample;

    for (let i = startSample; i < endSample && i < numSamples; i++) {
      const t = (i - startSample) / sampleRate;
      const localPos = (i - startSample) / noteDuration;

      // ADSR envelope
      let envelope;
      if (localPos < 0.05) {
        envelope = localPos / 0.05; // Attack
      } else if (localPos < 0.2) {
        envelope = 1.0 - (localPos - 0.05) * 0.3; // Decay
      } else if (localPos < 0.7) {
        envelope = 0.7; // Sustain
      } else {
        envelope = 0.7 * (1 - (localPos - 0.7) / 0.3); // Release
      }

      // Sine wave with a touch of harmonics for richness
      const value =
        Math.sin(2 * Math.PI * note.freq * t) * 0.8 +
        Math.sin(2 * Math.PI * note.freq * 2 * t) * 0.15 +
        Math.sin(2 * Math.PI * note.freq * 3 * t) * 0.05;

      samples[i] += value * envelope * note.volume;
    }
  }

  // Normalize
  let maxVal = 0;
  for (let i = 0; i < numSamples; i++) {
    maxVal = Math.max(maxVal, Math.abs(samples[i]));
  }
  const normalizeScale = maxVal > 0 ? 0.85 / maxVal : 1;

  // Convert to 16-bit PCM
  const pcm = Buffer.alloc(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.max(-1, Math.min(1, samples[i] * normalizeScale));
    const intVal = Math.floor(val * 32767);
    pcm.writeInt16LE(intVal, i * 2);
  }

  // Build WAV file
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcm.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(fileSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  const wav = Buffer.concat([header, pcm]);
  const outPath = path.join(
    __dirname,
    "frontend",
    "public",
    "success-alert.wav",
  );
  fs.writeFileSync(outPath, wav);
  console.log(
    `✅ Generated: ${outPath} (${(wav.length / 1024).toFixed(1)} KB)`,
  );
}

generateSuccessChime();
