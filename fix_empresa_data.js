const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data', 'normalized');
const files = fs.readdirSync(dataDir).filter(f => f.startsWith('norm_') && f.endsWith('.json') && !f.endsWith('.metadata.json'));

let modifiedCount = 0;

for (const f of files) {
    const filePath = path.join(dataDir, f);
    const content = fs.readFileSync(filePath, 'utf-8');
    let data = JSON.parse(content);
    
    let isModified = false;
    
    // Determine company based on filename prefix
    let companyName = "";
    if (f.startsWith('norm_raw_')) {
        companyName = "Pedidos Express";
    } else if (f.startsWith('norm_melo_')) {
        companyName = "Melo Express";
    }
    
    if (companyName) {
        for (const item of data) {
            if (!item.empresa) {
                item.empresa = companyName;
                isModified = true;
            }
        }
    }
    
    if (isModified) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`Updated ${f} with ${companyName}`);
        modifiedCount++;
    }
}

console.log(`Finished updating ${modifiedCount} files.`);
