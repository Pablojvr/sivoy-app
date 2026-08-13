const fs = require('fs');
let html = fs.readFileSync('a:\\SiVoyApp\\frontend\\src\\app\\app.html', 'utf8');

const replacements = [
  {
    regex: /<svg[^>]*><circle cx="12" cy="12" r="10"><\/circle><circle cx="12" cy="12" r="3"><\/circle><\/svg>/g,
    replace: '<span class="material-symbols-outlined">my_location</span>'
  },
  {
    regex: /<svg[^>]*>\s*<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"><\/path>\s*<circle cx="12" cy="10" r="3"><\/circle>\s*<\/svg>/g,
    replace: '<span class="material-symbols-outlined">location_on</span>'
  },
  {
    regex: /<svg[^>]*><circle cx="11" cy="11" r="8"><\/circle><line x1="21" y1="21" x2="16.65" y2="16.65"><\/line><\/svg>/g,
    replace: '<span class="material-symbols-outlined">search</span>'
  },
  {
    regex: /<svg[^>]*><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"><\/polygon><\/svg>/g,
    replace: '<span class="material-symbols-outlined">map</span>'
  },
  {
    regex: /<svg[^>]*><line x1="18" y1="6" x2="6" y2="18"><\/line><line x1="6" y1="6" x2="18" y2="18"><\/line><\/svg>/g,
    replace: '<span class="material-symbols-outlined">close</span>'
  },
  {
    regex: /<svg[^>]*><rect x="9" y="9" width="13" height="13" rx="2" ry="2"><\/rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"><\/path><\/svg>/g,
    replace: '<span class="material-symbols-outlined">content_copy</span>'
  },
  {
    regex: /<svg[^>]*class="status-icon"[^>]*><circle cx="12" cy="12" r="10"><\/circle><polyline points="12 6 12 12 16 14"><\/polyline><\/svg>/g,
    replace: '<span class="material-symbols-outlined status-icon">schedule</span>'
  },
  {
    regex: /<svg[^>]*class="status-icon"[^>]*><rect x="3" y="4" width="18" height="18" rx="2" ry="2"><\/rect><line x1="16" y1="2" x2="16" y2="6"><\/line><line x1="8" y1="2" x2="8" y2="6"><\/line><line x1="3" y1="10" x2="21" y2="10"><\/line><\/svg>/g,
    replace: '<span class="material-symbols-outlined status-icon">calendar_today</span>'
  },
  {
    regex: /<svg[^>]*class="status-icon"[^>]*><circle cx="12" cy="12" r="10"><\/circle><line x1="15" y1="9" x2="9" y2="15"><\/line><line x1="9" y1="9" x2="15" y2="15"><\/line><\/svg>/g,
    replace: '<span class="material-symbols-outlined status-icon">cancel</span>'
  },
  {
    regex: /<svg[^>]*><circle cx="12" cy="12" r="10"><\/circle><polyline points="12 16 16 12 12 8"><\/polyline><line x1="8" y1="12" x2="16" y2="12"><\/line><\/svg>/g,
    replace: '<span class="material-symbols-outlined" style="color:#ff7a59">arrow_circle_right</span>'
  },
  {
    regex: /<svg[^>]*><polyline points="20 6 9 17 4 12"><\/polyline><\/svg>/g,
    replace: '<span class="material-symbols-outlined">check</span>'
  },
  {
    regex: /<svg[^>]*><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"><\/path><line x1="12" y1="9" x2="12" y2="13"><\/line><line x1="12" y1="17" x2="12.01" y2="17"><\/line><\/svg>/g,
    replace: '<span class="material-symbols-outlined">warning</span>'
  },
  {
    regex: /<svg[^>]*class="spin-icon"[^>]*><circle[^>]*><\/circle><\/svg>/g,
    replace: '<span class="material-symbols-outlined spin-icon">progress_activity</span>'
  },
  {
    regex: /<svg[^>]*><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"><\/path><\/svg>/g,
    replace: '<span class="material-symbols-outlined">home</span>'
  },
  {
    regex: /<svg[^>]*><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"><\/path><polyline points="9 22 9 12 15 12 15 22"><\/polyline><\/svg>/g,
    replace: '<span class="material-symbols-outlined">home</span>'
  },
  {
    regex: /<svg[^>]*><rect x="2" y="7" width="20" height="14" rx="2" ry="2"><\/rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"><\/path><\/svg>/g,
    replace: '<span class="material-symbols-outlined">business_center</span>'
  },
  {
    regex: /<svg[^>]*><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"><\/path><circle cx="12" cy="7" r="4"><\/circle><\/svg>/g,
    replace: '<span class="material-symbols-outlined">person</span>'
  }
];

replacements.forEach(r => {
  html = html.replace(r.regex, r.replace);
});

fs.writeFileSync('a:\\SiVoyApp\\frontend\\src\\app\\app.html', html);
console.log('SVGs replaced');
