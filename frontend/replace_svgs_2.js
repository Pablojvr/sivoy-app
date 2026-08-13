const fs = require('fs');
let html = fs.readFileSync('a:\\SiVoyApp\\frontend\\src\\app\\app.html', 'utf8');

const replacements = [
  {
    regex: /<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"[^>]*>[\s\S]*?<line x1="18" y1="6" x2="6" y2="18"><\/line>[\s\S]*?<line x1="6" y1="6" x2="18" y2="18"><\/line>[\s\S]*?<\/svg>/g,
    replace: '<span class="material-symbols-outlined">close</span>'
  },
  {
    regex: /<svg class="spin-icon"[^>]*>[\s\S]*?<\/svg>/g,
    replace: '<span class="material-symbols-outlined spin-icon">progress_activity</span>'
  },
  {
    regex: /<svg viewBox="0 0 24 24" fill="currentColor"[^>]*>[\s\S]*?M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z[\s\S]*?<\/svg>/g,
    replace: '<span class="material-symbols-outlined" *ngIf="activeMainTab === \'inicio\'">home</span>'
  }
];

replacements.forEach(r => {
  html = html.replace(r.regex, r.replace);
});

fs.writeFileSync('a:\\SiVoyApp\\frontend\\src\\app\\app.html', html);
console.log('SVGs replaced part 2');
