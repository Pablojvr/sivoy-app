fetch('http://localhost:3000/api/get-upcoming-routes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    origen: ['AGENCIA SOYAPANGO'],
    destino: ['CANDELARIA DE LA FRONTERA']
  })
}).then(r => r.json()).then(data => console.log(JSON.stringify(data, null, 2))).catch(console.error);
