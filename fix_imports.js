const fs = require('fs');

function fixImports(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    if (filePath.endsWith('mobile-app.component.ts')) {
        content = content.replace(/import \{ environment \} from '\.\/environments\/environment';/g, "import { environment } from '../environments/environment';");
    } else if (filePath.includes('core/services') || filePath.includes('features/admin') || filePath.includes('features/home') || filePath.includes('features/partner') || filePath.includes('registro-punto')) {
        let depth = 0;
        if (filePath.includes('src/app/')) {
            depth = filePath.split('src/app/')[1].split('/').length;
        }
        let prefix = '../'.repeat(depth);
        let replaceTarget = "import { environment } from '../../environments/environment';";
        let newImport = "import { environment } from '" + prefix + "environments/environment';";
        
        // generic replace to just find the line
        content = content.replace(/import \{ environment \} from '[^']+';/, newImport);
    }
    
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log("Fixed: " + filePath);
    }
}

function walk(dir) {
    let list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            walk(file);
        } else { 
            if (file.endsWith('.ts')) {
                fixImports(file);
            }
        }
    });
}

walk('A:/SiVoyApp/frontend/src/app');
