const fs = require('fs');
let f = fs.readFileSync('src/lib/mock.ts', 'utf8');
f = f.replace(/audio_url: /g, 'audio_peaks: [],\n    audio_url: ');
fs.writeFileSync('src/lib/mock.ts', f);
