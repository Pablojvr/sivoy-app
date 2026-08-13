import json
import glob
import os
import argparse

DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

def get_day_index(dia):
    try:
        return DIAS.index(dia.capitalize())
    except ValueError:
        return -1

def get_next_day(dia):
    idx = get_day_index(dia)
    return DIAS[(idx + 1) % 7]

def load_data(base_dir):
    json_files = glob.glob(os.path.join(base_dir, "norm_raw_*.json"))
    all_data = []
    for jf in json_files:
        with open(jf, 'r', encoding='utf-8') as f:
            all_data.extend(json.load(f))
    return all_data

def find_destino(data, nombre):
    nombre_lower = nombre.lower()
    for d in data:
        if not isinstance(d, dict):
            continue
        if d.get('nombre_destino', '').lower() == nombre_lower or d.get('id_destino', '').lower() == nombre_lower:
            return d
    return None

def days_diff(dia_inicio, dia_fin):
    idx_inicio = get_day_index(dia_inicio)
    idx_fin = get_day_index(dia_fin)
    if idx_fin >= idx_inicio:
        return idx_fin - idx_inicio
    else:
        return (7 - idx_inicio) + idx_fin

def calcular_eta(destino, ingreso_oficial):
    reglas = destino.get('reglas_entrega', [])
    if not reglas:
        return None, "Sin reglas definidas", 0
        
    opciones = []
    for r in reglas:
        entrega = r['dia_entrega']
        corte_raw = r['dia_corte_maximo']
        
        if entrega.lower() == 'diario':
            espera = 1
            opciones.append({
                'corte': 'Día anterior',
                'entrega': get_next_day(ingreso_oficial),
                'espera': espera,
                'es_diario': True
            })
            continue

        if corte_raw.lower() == 'día anterior':
            idx_entrega = get_day_index(entrega)
            corte_real = DIAS[(idx_entrega - 1) % 7]
        else:
            corte_real = corte_raw
            
        espera_hasta_entrega = days_diff(ingreso_oficial, entrega)
        espera_hasta_corte = days_diff(ingreso_oficial, corte_real)
        
        if espera_hasta_corte < espera_hasta_entrega:
            espera_total = espera_hasta_entrega
        else:
            espera_total = espera_hasta_entrega + 7
            if espera_total == 0:
                espera_total = 7

        opciones.append({
            'corte': corte_real,
            'entrega': entrega,
            'espera': espera_total,
            'es_diario': False
        })
        
    opciones.sort(key=lambda x: x['espera'])
    
    if opciones:
        mejor = opciones[0]
        if mejor['es_diario']:
            return mejor['entrega'], f"Corte: Diario", mejor['espera']
        else:
            return mejor['entrega'], f"Corte: {mejor['corte']}", mejor['espera']
    
    return None, "Error", 0

def main():
    parser = argparse.ArgumentParser(description="Planificador de Rutas")
    parser.add_argument("--origen", required=True, help="Destino de origen")
    parser.add_argument("--destino", required=True, help="Destino final")
    
    args = parser.parse_args()
    
    base_dir = r"A:\SiVoyApp\data\normalized"
    data = load_data(base_dir)
    
    origen_obj = find_destino(data, args.origen)
    destino_obj = find_destino(data, args.destino)
    
    if not origen_obj:
        print(f"Error: Origen '{args.origen}' no encontrado.")
        return
    if not destino_obj:
        print(f"Error: Destino '{args.destino}' no encontrado.")
        return
        
    print(f"\n=== MATRIZ DE ENRUTAMIENTO ===")
    print(f"ORIGEN:  {origen_obj['nombre_destino']} ({origen_obj['tipo']})")
    print(f"DESTINO: {destino_obj['nombre_destino']} ({destino_obj['tipo']})")
    print("Asumiendo entrega a tiempo (dentro del horario operativo)\n")
    print(f"{'Día de Ingreso (Origen)':<25} | {'Día de Llegada (ETA)':<20} | {'Tiempo en Tránsito'}")
    print("-" * 70)
    
    # Obtener dias operativos del origen
    dias_operativos_origen = [h['dia_semana'].capitalize() for h in origen_obj.get('horarios_operativos', [])]
    
    for dia in DIAS:
        if dia not in dias_operativos_origen:
            print(f"{dia:<25} | CERRADO EN ORIGEN      | -")
            continue
            
        eta_dia, mensaje_corte, espera = calcular_eta(destino_obj, dia)
        if eta_dia:
            print(f"{dia:<25} | {eta_dia.upper():<20} | {espera} día(s) ({mensaje_corte})")
        else:
            print(f"{dia:<25} | ERROR                  | {mensaje_corte}")

    print("-" * 70)
    print("\n")

if __name__ == '__main__':
    main()
