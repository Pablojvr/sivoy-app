const ExcelJS = require('exceljs');

exports.downloadTemplate = async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SiVoyApp Logistics';
    workbook.created = new Date();

    // 1. Hoja de Instrucciones
    const sheet1 = workbook.addWorksheet('Instrucciones', { properties: { tabColor: { argb: 'FFC000' } } });
    sheet1.columns = [{ width: 80 }];
    sheet1.addRow(['Bienvenido a la Plantilla de Importación Masiva de Puntos SiVoyApp']);
    sheet1.addRow(['']);
    sheet1.addRow(['Siga estas instrucciones cuidadosamente para no generar errores de logística:']);
    sheet1.addRow(['1. HOJA "Puntos_y_Direcciones": Ingrese los nombres, ubicaciones geográficas y antelación base.']);
    sheet1.addRow(['2. HOJA "Horarios_Complejos": Ingrese los horarios por cada punto. Puede repetir el nombre del punto para turnos dobles.']);
    sheet1.addRow(['3. HOJA "Excepciones_Rutas": Sólo si existen restricciones específicas de Point-to-Point.']);
    sheet1.getCell('A1').font = { bold: true, size: 14 };
    
    // 2. Hoja de Puntos Base
    const sheet2 = workbook.addWorksheet('Puntos_y_Direcciones', { properties: { tabColor: { argb: '00B050' } } });
    sheet2.columns = [
      { header: 'Nombre del Punto', key: 'nombre', width: 30 },
      { header: 'Departamento', key: 'depto', width: 20 },
      { header: 'Municipio', key: 'muni', width: 20 },
      { header: 'Latitud', key: 'lat', width: 15 },
      { header: 'Longitud', key: 'lng', width: 15 },
      { header: 'Días Antelación Base', key: 'antelacion', width: 20 }
    ];
    sheet2.getRow(1).font = { bold: true };
    
    // 3. Hoja de Horarios
    const sheet3 = workbook.addWorksheet('Horarios_Complejos', { properties: { tabColor: { argb: '0070C0' } } });
    sheet3.columns = [
      { header: 'Nombre del Punto', key: 'nombre', width: 30 },
      { header: 'Día de la Semana', key: 'dia', width: 20 },
      { header: 'Hora Apertura (HH:MM)', key: 'apertura', width: 25 },
      { header: 'Hora Cierre (HH:MM)', key: 'cierre', width: 25 }
    ];
    sheet3.getRow(1).font = { bold: true };
    // Data validation for days
    for (let i = 2; i <= 500; i++) {
      sheet3.getCell(`B${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Lunes,Martes,Miércoles,Jueves,Viernes,Sábado,Domingo"']
      };
    }

    // 4. Hoja de Excepciones de Rutas
    const sheet4 = workbook.addWorksheet('Excepciones_Rutas', { properties: { tabColor: { argb: 'C00000' } } });
    sheet4.columns = [
      { header: 'Punto Origen', key: 'origen', width: 30 },
      { header: 'Punto Destino', key: 'destino', width: 30 },
      { header: 'Tipo Regla', key: 'tipo', width: 20 },
      { header: 'Valor Condición', key: 'valor', width: 20 }
    ];
    sheet4.getRow(1).font = { bold: true };
    for (let i = 2; i <= 500; i++) {
      sheet4.getCell(`C${i}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Día de Corte,Días Antelación"']
      };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'Plantilla_Masiva_Puntos.xlsx'
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Error generating excel template:', error);
    res.status(500).json({ success: false, message: 'Failed to generate excel template' });
  }
};
