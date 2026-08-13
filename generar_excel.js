const xlsx = require('xlsx');
const fs = require('fs');

// Crear un libro de trabajo
const wb = xlsx.utils.book_new();

// Datos de ejemplo y cabeceras
const data = [
  {
    Empresa: 'Pedidos Express',
    Nombre_Destino: 'Agencia Principal',
    Municipio: 'San Salvador',
    Departamento: 'San Salvador',
    Google_Maps_Link: 'https://maps.app.goo.gl/...',
    Latitud: '13.6929',
    Longitud: '-89.2181',
    Lunes_Habilitado: 'SI', Lunes_Apertura: '08:00', Lunes_Cierre: '17:00', Lunes_Accion: 'Ambos',
    Martes_Habilitado: 'SI', Martes_Apertura: '08:00', Martes_Cierre: '17:00', Martes_Accion: 'Ambos',
    Miercoles_Habilitado: 'SI', Miercoles_Apertura: '08:00', Miercoles_Cierre: '17:00', Miercoles_Accion: 'Ambos',
    Jueves_Habilitado: 'SI', Jueves_Apertura: '08:00', Jueves_Cierre: '17:00', Jueves_Accion: 'Ambos',
    Viernes_Habilitado: 'SI', Viernes_Apertura: '08:00', Viernes_Cierre: '17:00', Viernes_Accion: 'Ambos',
    Sabado_Habilitado: 'SI', Sabado_Apertura: '08:00', Sabado_Cierre: '12:00', Sabado_Accion: 'Solo Recibir',
    Domingo_Habilitado: 'NO', Domingo_Apertura: '', Domingo_Cierre: '', Domingo_Accion: '',
    Dias_Antelacion: 1
  },
  {
    Empresa: 'Mi Empresa S.A.',
    Nombre_Destino: 'Sucursal Norte',
    Municipio: 'Apopa',
    Departamento: 'San Salvador',
    Google_Maps_Link: '',
    Latitud: '13.7999',
    Longitud: '-89.1764',
    Lunes_Habilitado: 'SI', Lunes_Apertura: '09:00', Lunes_Cierre: '18:00', Lunes_Accion: 'Ambos',
    Martes_Habilitado: 'SI', Martes_Apertura: '09:00', Martes_Cierre: '18:00', Martes_Accion: 'Ambos',
    Miercoles_Habilitado: 'SI', Miercoles_Apertura: '09:00', Miercoles_Cierre: '18:00', Miercoles_Accion: 'Ambos',
    Jueves_Habilitado: 'SI', Jueves_Apertura: '09:00', Jueves_Cierre: '18:00', Jueves_Accion: 'Ambos',
    Viernes_Habilitado: 'SI', Viernes_Apertura: '09:00', Viernes_Cierre: '18:00', Viernes_Accion: 'Ambos',
    Sabado_Habilitado: 'NO', Sabado_Apertura: '', Sabado_Cierre: '', Sabado_Accion: '',
    Domingo_Habilitado: 'NO', Domingo_Apertura: '', Domingo_Cierre: '', Domingo_Accion: '',
    Dias_Antelacion: 2
  }
];

// Convertir datos a hoja
const ws = xlsx.utils.json_to_sheet(data);

// Añadir la hoja al libro
xlsx.utils.book_append_sheet(wb, ws, "Puntos_Registro");

// Guardar el archivo Excel
xlsx.writeFile(wb, "Plantilla_Registro_Puntos.xlsx");
console.log("Archivo Excel generado en A:\\SiVoyApp\\Plantilla_Registro_Puntos.xlsx");
