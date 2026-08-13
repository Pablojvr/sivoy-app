const fs = require('fs');
const path = require('path');
const https = require('https');

const dataDir = path.join(__dirname, '..', '..', 'data', 'normalized');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function geocode(query) {
    return new Promise((resolve, reject) => {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`;
        https.get(url, { headers: { 'User-Agent': 'SiVoyApp Internal Geocoding Service v1.0' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                } catch (e) {
                    resolve([]);
                }
            });
        }).on('error', err => reject(err));
    });
}

async function run() {
    console.log('[Geocoding Service] Starting...');
    if (!fs.existsSync(path.join(__dirname, '..', 'scripts'))) {
        fs.mkdirSync(path.join(__dirname, '..', 'scripts'));
    }
    
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('norm_') && f.endsWith('.json') && !f.endsWith('.metadata.json'));
    
    let totalUpdated = 0;

    for (const file of files) {
        console.log(`\n[Geocoding Service] Processing file: ${file}`);
        const filePath = path.join(dataDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        
        let fileUpdated = false;

        for (let i = 0; i < data.length; i++) {
            const loc = data[i];
            
            // Clean up name: remove "AGENCIA" or specific prefixes to help Nominatim
            let cleanName = loc.nombre_destino.replace(/AGENCIA|SUCURSAL/gi, '').trim();
            const muni = loc.ubicacion.municipio;
            const dep = loc.ubicacion.departamento;
            
            const queryExact = `${cleanName}, ${muni}, El Salvador`;
            const queryFallback = `${muni}, ${dep}, El Salvador`;

            process.stdout.write(`[Geocoding Service] (${i+1}/${data.length}) ${loc.nombre_destino} -> `);
            
            let result = await geocode(queryExact);
            await delay(1100); // Wait 1.1s to respect Nominatim TOS
            
            if (result && result.length > 0) {
                loc.ubicacion.lat = parseFloat(result[0].lat);
                loc.ubicacion.lng = parseFloat(result[0].lon);
                console.log(`EXACT (${loc.ubicacion.lat.toFixed(4)}, ${loc.ubicacion.lng.toFixed(4)})`);
                fileUpdated = true;
                totalUpdated++;
            } else {
                result = await geocode(queryFallback);
                await delay(1100);
                
                if (result && result.length > 0) {
                    loc.ubicacion.lat = parseFloat(result[0].lat);
                    loc.ubicacion.lng = parseFloat(result[0].lon);
                    console.log(`FALLBACK MUNI (${loc.ubicacion.lat.toFixed(4)}, ${loc.ubicacion.lng.toFixed(4)})`);
                    fileUpdated = true;
                    totalUpdated++;
                } else {
                    console.log(`FAILED`);
                }
            }
        }

        if (fileUpdated) {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`[Geocoding Service] Saved updates for ${file}`);
        }
    }
    
    console.log(`\n[Geocoding Service] Finished! Total locations updated: ${totalUpdated}`);
}

run().catch(err => console.error(err));
