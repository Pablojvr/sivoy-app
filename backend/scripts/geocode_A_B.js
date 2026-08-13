const fs = require('fs');
const path = require('path');
const https = require('https');

const dataDir = path.join(__dirname, '..', '..', 'data', 'normalized');
const filePath = path.join(dataDir, 'norm_raw_A_B.json');

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
    console.log('[Geocoding A-B] Starting...');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let fileUpdated = false;

    for (let i = 0; i < data.length; i++) {
        const loc = data[i];
        
        let cleanName = loc.nombre_destino.replace(/AGENCIA|SUCURSAL/gi, '').trim();
        const muni = loc.ubicacion.municipio;
        const dep = loc.ubicacion.departamento;
        
        const q1 = `${cleanName}, ${muni}, ${dep}, El Salvador`;
        const q2 = `${muni}, ${dep}, El Salvador`;

        try {
            let results = await geocode(q1);
            await delay(1200);

            if (!results || results.length === 0) {
                results = await geocode(q2);
                await delay(1200);
            }

            if (results && results.length > 0) {
                loc.ubicacion.lat = parseFloat(results[0].lat);
                loc.ubicacion.lng = parseFloat(results[0].lon);
                console.log(`[Geocoding A-B] (${i+1}/${data.length}) ${cleanName} -> EXACT (${loc.ubicacion.lat}, ${loc.ubicacion.lng})`);
                fileUpdated = true;
            } else {
                console.log(`[Geocoding A-B] (${i+1}/${data.length}) ${cleanName} -> FAILED`);
            }
        } catch (e) {
            console.error(`[Geocoding A-B] Error on ${cleanName}:`, e.message);
        }
    }

    if (fileUpdated) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`[Geocoding A-B] SAVED updated file!`);
    } else {
        console.log(`[Geocoding A-B] No updates needed.`);
    }
}

run();
