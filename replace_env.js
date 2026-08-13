const fs = require('fs');
const path = require('path');

function replaceInFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    if (filePath.endsWith('.ts')) {
        // Find if environment is imported
        if (content.includes('http://localhost:3000') && !content.includes("from 'src/environments/environment'") && !content.includes('from "../../../environments/environment"')) {
            // we will just use a generic import path or relative if possible. Since we are lazy, we can just use relative from src/app
            // But wait, the easiest is to just use 'src/environments/environment' if tsconfig paths allow it, but standard is relative.
            // A simpler way for a generic script:
            let depth = 0;
            if (filePath.includes('src/app/')) {
                depth = filePath.split('src/app/')[1].split('/').length - 1;
            }
            let importPath = '../'.repeat(depth) + 'environments/environment';
            if (depth === 0) importPath = './environments/environment';
            
            content = "import { environment } from '" + importPath + "';\n" + content;
        }

        // Replace all instances
        content = content.replace(/'http:\/\/localhost:3000(\/api[^']*)'/g, "environment.apiUrl + '$1'");
        content = content.replace(/`http:\/\/localhost:3000([^`]*)`/g, "`\${environment.apiUrl}$1`");
        content = content.replace(/'http:\/\/localhost:3000'/g, "environment.apiUrl");
    } else if (filePath.endsWith('.html')) {
        // In html we can't easily use environment.apiUrl unless it's a property in the component.
        // It's better to expose `apiUrl = environment.apiUrl` in the component.ts and use `apiUrl` in html.
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log("Updated: " + filePath);
    }
}

function walk(dir) {
    let results = [];
    let list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = dir + '/' + file;
        let stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            /* Recurse into a subdirectory */
            results = results.concat(walk(file));
        } else { 
            /* Is a file */
            if (file.endsWith('.ts') || file.endsWith('.html')) {
                replaceInFile(file);
            }
            results.push(file);
        }
    });
    return results;
}

walk('A:/SiVoyApp/frontend/src/app');
