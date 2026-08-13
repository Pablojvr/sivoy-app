import json
import glob
import os

def escape_sql(val):
    if val is None:
        return 'NULL'
    return f"'{str(val).replace(chr(39), chr(39)+chr(39))}'"

def main():
    base_dir = r"C:\Users\Javier\.gemini\antigravity\brain\24c169e7-3863-408f-a738-def72cebf73f\scratch"
    json_files = glob.glob(os.path.join(base_dir, "norm_raw_*.json"))
    
    all_data = []
    for jf in json_files:
        with open(jf, 'r', encoding='utf-8') as f:
            data = json.load(f)
            all_data.extend(data)
            
    # Sort for deterministic output
    all_data.sort(key=lambda x: x.get('nombre_destino', ''))
    
    destinos_sql = []
    horarios_sql = []
    reglas_sql = []
    
    id_horario = 1
    id_regla = 1
    
    for d in all_data:
        id_destino_val = d.get('id_destino')
        if not id_destino_val:
            continue
            
        id_destino = escape_sql(id_destino_val)
        nombre_destino = escape_sql(d.get('nombre_destino'))
        tipo = escape_sql(d.get('tipo'))
        
        ubicacion = d.get('ubicacion', {})
        depto = escape_sql(ubicacion.get('departamento'))
        muni = escape_sql(ubicacion.get('municipio'))
        dir_ref = escape_sql(ubicacion.get('direccion_referencia'))
        
        # INSERT DESTINOS
        destinos_sql.append(f"INTO DESTINOS (id_destino, nombre_destino, tipo, departamento, municipio, direccion_referencia) "
                            f"VALUES ({id_destino}, {nombre_destino}, {tipo}, {depto}, {muni}, {dir_ref})")
                            
        # INSERT HORARIOS
        for h in d.get('horarios_operativos', []):
            dia_semana = escape_sql(h.get('dia_semana'))
            hora_aper = escape_sql(h.get('hora_apertura'))
            hora_cierre = escape_sql(h.get('hora_cierre'))
            horarios_sql.append(f"INTO HORARIOS_OPERATIVOS (id_horario, id_destino, dia_semana, hora_apertura, hora_cierre) "
                                f"VALUES ({id_horario}, {id_destino}, {dia_semana}, {hora_aper}, {hora_cierre})")
            id_horario += 1
            
        # INSERT REGLAS
        for r in d.get('reglas_entrega', []):
            dia_ent = escape_sql(r.get('dia_entrega'))
            dia_corte = escape_sql(r.get('dia_corte_maximo'))
            reglas_sql.append(f"INTO REGLAS_ENTREGA (id_regla, id_destino, dia_entrega, dia_corte_maximo) "
                              f"VALUES ({id_regla}, {id_destino}, {dia_ent}, {dia_corte})")
            id_regla += 1
            
    out_file = r"C:\Users\Javier\.gemini\antigravity\brain\24c169e7-3863-408f-a738-def72cebf73f\inserts_logistica_v2.sql"
    with open(out_file, 'w', encoding='utf-8') as out:
        out.write("-- POBLADO DE DATOS (DML) - LOGISTICA V2\n\n")
        
        # DESTINOS
        out.write("INSERT ALL\n")
        out.write("\n".join(destinos_sql))
        out.write("\nSELECT 1 FROM DUAL;\n\n")
        
        # HORARIOS
        out.write("INSERT ALL\n")
        out.write("\n".join(horarios_sql))
        out.write("\nSELECT 1 FROM DUAL;\n\n")
        
        # REGLAS
        out.write("INSERT ALL\n")
        out.write("\n".join(reglas_sql))
        out.write("\nSELECT 1 FROM DUAL;\n")
        
    print(f"Generated SQL at {out_file} with {len(destinos_sql)} destinations, {len(horarios_sql)} horarios, and {len(reglas_sql)} reglas.")

if __name__ == '__main__':
    main()
