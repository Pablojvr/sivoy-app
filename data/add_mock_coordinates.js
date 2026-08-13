const fs = require('fs');
const path = require('path');

const deptoCoordinates = {
    'San Salvador': { lat: 13.6929, lng: -89.2182 },
    'Santa Ana': { lat: 13.9942, lng: -89.5597 },
    'San Miguel': { lat: 13.4833, lng: -88.1833 },
    'La Libertad': { lat: 13.6769, lng: -89.2797 },
    'Usulután': { lat: 13.3444, lng: -88.4392 },
    'Sonsonate': { lat: 13.7189, lng: -89.7242 },
    'La Unión': { lat: 13.3369, lng: -87.8439 },
    'Ahuachapán': { lat: 13.9214, lng: -89.8450 },
    'La Paz': { lat: 13.4878, lng: -88.8683 },
    'Chalatenango': { lat: 14.0375, lng: -88.9328 },
    'Cuscatlán': { lat: 13.7222, lng: -88.9372 },
    'San Vicente': { lat: 13.6442, lng: -88.7844 },
    'Morazán': { lat: 13.7744, lng: -88.0933 },
    'Cabañas': { lat: 13.8647, lng: -88.6253 }
};

function getCoordinates(departamento) {
    const base = deptoCoordinates[departamento] || deptoCoordinates['San Salvador'];
    const latOffset = (Math.random() - 0.5) * 0.05;
    const lngOffset = (Math.random() - 0.5) * 0.05;
    return {
        lat: base.lat + latOffset,
        lng: base.lng + lngOffset
    };
}

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let modified = false;
    
    data.forEach(item => {
        if (item.ubicacion && !item.ubicacion.lat) {
            const coords = getCoordinates(item.ubicacion.departamento);
            item.ubicacion.lat = coords.lat;
            item.ubicacion.lng = coords.lng;
            modified = true;
        }
    });

    if (modified) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log('Updated ' + filePath);
    }
}

const dir = './data/normalized';
fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.json') && !file.endsWith('.metadata.json')) {
        processFile(path.join(dir, file));
    }
});
