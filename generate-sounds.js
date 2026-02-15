// Generate notification sound WAV files for NearMe app
const fs = require("fs");
const path = require("path");

function writeWavFile(filepath, buffer, sampleRate) {
  const numSamples = buffer.length;
  const wavBuffer = Buffer.alloc(44 + numSamples * 2);

  // WAV header
  wavBuffer.write("RIFF", 0);
  wavBuffer.writeUInt32LE(36 + numSamples * 2, 4);
  wavBuffer.write("WAVE", 8);
  wavBuffer.write("fmt ", 12);
  wavBuffer.writeUInt32LE(16, 16); // chunk size
  wavBuffer.writeUInt16LE(1, 20); // PCM
  wavBuffer.writeUInt16LE(1, 22); // mono
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  wavBuffer.writeUInt16LE(2, 32); // block align
  wavBuffer.writeUInt16LE(16, 34); // bits per sample
  wavBuffer.write("data", 36);
  wavBuffer.writeUInt32LE(numSamples * 2, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    wavBuffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filepath, wavBuffer);
  console.log(
    `Created: ${filepath} (${(wavBuffer.length / 1024).toFixed(1)} KB)`,
  );
}

// 1. NOTIFICATION TONE - Pleasant single-ring chime for customer & manager
function generateNotificationTone() {
  const sampleRate = 44100;
  const duration = 0.7;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // First chime: E6 (1318 Hz) - bright ding
    if (t < 0.3) {
      const env = Math.exp(-t * 7) * 0.55;
      sample += Math.sin(2 * Math.PI * 1318 * t) * env;
      sample += Math.sin(2 * Math.PI * 2636 * t) * env * 0.15; // harmonic
      sample += Math.sin(2 * Math.PI * 659 * t) * env * 0.1; // sub-harmonic
    }

    // Second chime: G6 (1568 Hz) - pleasant resolution
    if (t >= 0.18 && t < 0.65) {
      const t2 = t - 0.18;
      const env = Math.exp(-t2 * 5) * 0.45;
      sample += Math.sin(2 * Math.PI * 1568 * t2) * env;
      sample += Math.sin(2 * Math.PI * 3136 * t2) * env * 0.1;
      sample += Math.sin(2 * Math.PI * 784 * t2) * env * 0.08;
    }

    buffer[i] = Math.max(-1, Math.min(1, sample));
  }

  return { buffer: Array.from(buffer), sampleRate };
}

// 2. DRIVER ALERT TONE - More attention-grabbing, ascending notification
function generateDriverAlertTone() {
  const sampleRate = 44100;
  const duration = 1.2;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Three ascending tones creating urgency
    // Tone 1: C6 (1047 Hz)
    if (t < 0.25) {
      const env = Math.exp(-t * 6) * 0.5;
      sample += Math.sin(2 * Math.PI * 1047 * t) * env;
      sample += Math.sin(2 * Math.PI * 2094 * t) * env * 0.12;
    }
    // Tone 2: E6 (1318 Hz)
    if (t >= 0.22 && t < 0.5) {
      const t2 = t - 0.22;
      const env = Math.exp(-t2 * 5) * 0.5;
      sample += Math.sin(2 * Math.PI * 1318 * t2) * env;
      sample += Math.sin(2 * Math.PI * 2636 * t2) * env * 0.12;
    }
    // Tone 3: G6 (1568 Hz) - held a bit longer
    if (t >= 0.44 && t < 1.0) {
      const t3 = t - 0.44;
      const env = Math.exp(-t3 * 3) * 0.55;
      sample += Math.sin(2 * Math.PI * 1568 * t3) * env;
      sample += Math.sin(2 * Math.PI * 3136 * t3) * env * 0.1;
    }

    buffer[i] = Math.max(-1, Math.min(1, sample));
  }

  return { buffer: Array.from(buffer), sampleRate };
}

// Generate and save
const publicDir = path.join(__dirname, "frontend", "public");

const notifTone = generateNotificationTone();
writeWavFile(
  path.join(publicDir, "notification-tone.wav"),
  notifTone.buffer,
  notifTone.sampleRate,
);

const driverTone = generateDriverAlertTone();
writeWavFile(
  path.join(publicDir, "driver-alert-tone.wav"),
  driverTone.buffer,
  driverTone.sampleRate,
);

console.log("\nDone! Sound files generated.");
