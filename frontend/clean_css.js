const fs = require('fs');
let css = fs.readFileSync('a:\\SiVoyApp\\frontend\\src\\app\\app.css', 'utf8');

css = css.replace(/svg\s*{[^}]*}/g, '');
css = css.replace(/\.search-box svg,\s*\.loc-icon svg\s*{[^}]*}/g, '');
css = css.replace(/\.search-box svg\s*{[^}]*}/g, '');
css = css.replace(/\.loc-icon svg\s*{[^}]*}/g, '');
css = css.replace(/\.recenter-btn svg\s*{[^}]*}/g, '');
css = css.replace(/\.location-modal \.back-btn svg\s*{[^}]*}/g, '');
css = css.replace(/\.nav-item svg\s*{[^}]*}/g, '');
css = css.replace(/\.fab-button svg\s*{[^}]*}/g, '');
css = css.replace(/\.empty-icon-box svg\s*{[^}]*}/g, '');
css = css.replace(/\.nearby-fab svg\s*{[^}]*}/g, '');
css = css.replace(/\.flight-divider svg\s*{[^}]*}/g, '');

const materialCss = "\n.material-symbols-outlined {\n  font-family: 'Material Symbols Outlined';\n  font-weight: normal;\n  font-style: normal;\n  font-size: 24px;\n  line-height: 1;\n  letter-spacing: normal;\n  text-transform: none;\n  display: inline-block;\n  white-space: nowrap;\n  word-wrap: normal;\n  direction: ltr;\n  -webkit-font-feature-settings: 'liga';\n  -webkit-font-smoothing: antialiased;\n}\n\n.search-box .material-symbols-outlined,\n.loc-icon .material-symbols-outlined {\n  font-size: 20px;\n  color: var(--text-muted);\n}\n\n.recenter-btn .material-symbols-outlined {\n  font-size: 24px;\n  color: var(--text-primary);\n}\n\n.nav-item .material-symbols-outlined,\n.fab-button .material-symbols-outlined {\n  font-size: 24px;\n}\n\n.empty-icon-box .material-symbols-outlined {\n  font-size: 32px;\n}\n\n.nearby-fab .material-symbols-outlined {\n  font-size: 18px;\n}\n";

css = css + materialCss;

fs.writeFileSync('a:\\SiVoyApp\\frontend\\src\\app\\app.css', css);
console.log('CSS cleaned and material symbols added');
