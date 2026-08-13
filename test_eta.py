import json
import glob
import os
import argparse
from datetime import datetime

# Mapeo de días para cálculos cronológicos
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

def calcular_ingreso_oficial(origen, dia_actual, hora_actual):
    # Buscar si está abierto el día actual
    horario_hoy = None
    for h in origen.get('horarios_operativos', []):
        if h['dia_semana'].lower() == dia_actual.lower():
            horario_hoy = h
            break
            
    if not horario_hoy:
        print(f"  [!] El origen '{origen['nombre_destino']}' no abre el {dia_actual}.")
        # Buscar siguiente día hábil
        dia_eval = get_next_day(dia_actual)
        for _ in range(7):
            for h in origen.get('horarios_operativos', []):
                if h['dia_semana'].lower() == dia_eval.lower():
                    print(f"  [>] Ingreso oficial desplazado al próximo día hábil: {dia_eval}")
                    return dia_eval
            dia_eval = get_next_day(dia_eval)
        return None
        
    # Comparar hora
    # hora_actual y hora_cierre están en formato "HH:MM"
    if hora_actual <= horario_hoy['hora_cierre']:
        print(f"  [>] Paquete ingresado a tiempo antes del cierre ({horario_hoy['hora_cierre']}).")
        return dia_actual
    else:
        print(f"  [!] Paquete ingresado TARDE. Hora actual {hora_actual} > Cierre {horario_hoy['hora_cierre']}.")
        # Buscar siguiente día hábil
        dia_eval = get_next_day(dia_actual)
        for _ in range(7):
            for h in origen.get('horarios_operativos', []):
                if h['dia_semana'].lower() == dia_eval.lower():
                    print(f"  [>] Ingreso oficial desplazado al próximo día hábil: {dia_eval}")
                    return dia_eval
            dia_eval = get_next_day(dia_eval)
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
        return "Sin reglas definidas"
        
    opciones = []
    for r in reglas:
        entrega = r['dia_entrega']
        corte_raw = r['dia_corte_maximo']
        
        # Si es servicio diario
        if entrega.lower() == 'diario':
            # Si se ingresa el día X, llega el día X+1
            espera = 1
            opciones.append({
                'corte': 'Día anterior',
                'entrega': get_next_day(ingreso_oficial),
                'espera': espera,
                'es_diario': True
            })
            continue

        # Si el día de entrega es específico (Ej. Lunes o Jueves)
        if corte_raw.lower() == 'día anterior':
            # El corte real es el día anterior al de entrega
            idx_entrega = get_day_index(entrega)
            corte_real = DIAS[(idx_entrega - 1) % 7]
        else:
            corte_real = corte_raw
            
        # Calcular los días de espera desde el INGRESO hasta el DÍA DE ENTREGA
        # Esto es lo que realmente le importa al cliente (cuántos días faltan para que llegue)
        espera_hasta_entrega = days_diff(ingreso_oficial, entrega)
        
        # Calcular los días de espera desde el INGRESO hasta el DÍA DE CORTE
        # Si es negativo (en ciclo de 7 días, o sea si el ingreso es después del corte), 
        # significa que ya pasó el corte para la ruta MÁS PRÓXIMA, 
        # por lo que debe tomar la ruta de la SIGUIENTE SEMANA (sumar 7 días de espera)
        
        # Verificamos si el ingreso oficial está a tiempo para el corte
        espera_hasta_corte = days_diff(ingreso_oficial, corte_real)
        
        # Si el corte está ANTES que la entrega, espera_hasta_corte debe ser MENOR que espera_hasta_entrega.
        # Ej. Ingreso: Lunes, Corte: Miércoles, Entrega: Jueves
        # espera_hasta_corte = 2 (L->M->X)
        # espera_hasta_entrega = 3 (L->M->X->J)
        # 2 < 3, entonces SI alcanza.
        
        if espera_hasta_corte < espera_hasta_entrega:
            # Alcanza el corte de esta semana
            espera_total = espera_hasta_entrega
        else:
            # Ya pasó el corte de esta semana. Pasa a la siguiente semana (espera + 7 días)
            # Ej: Ingreso: Lunes. Entrega: Lunes. Corte: Domingo.
            # espera_hasta_entrega = 0
            # espera_hasta_corte = 6
            # 6 NO ES MENOR que 0. Entonces pasó el corte.
            # La entrega será en 7 días.
            espera_total = espera_hasta_entrega + 7
            if espera_total == 0: # Si era el mismo dia, asegurar que pase a la proxima semana
                espera_total = 7

        opciones.append({
            'corte': corte_real,
            'entrega': entrega,
            'espera': espera_total,
            'es_diario': False
        })
        
    # Ordenar por el que tenga la entrega más pronta (menor espera total)
    opciones.sort(key=lambda x: x['espera'])
    
    if opciones:
        mejor = opciones[0]
        if mejor['es_diario']:
            return f"{mejor['entrega']} (Servicio Diario)"
        else:
            return f"{mejor['entrega']} (Corte el {mejor['corte']})"
    
    return "No se pudo calcular"

def main():
    parser = argparse.ArgumentParser(description="Simulador de ETA Logístico (MVP)")
    parser.add_argument("--origen", required=True, help="Nombre o ID del destino de origen")
    parser.add_argument("--destino", required=True, help="Nombre o ID del destino final")
    parser.add_argument("--dia", required=True, help="Día de la semana de entrega física (Ej. Lunes)")
    parser.add_argument("--hora", required=True, help="Hora de entrega física en 24h (Ej. 14:30)")
    
    args = parser.parse_args()
    
    base_dir = r"A:\SiVoyApp\data\normalized"
    data = load_data(base_dir)
    
    origen_obj = find_destino(data, args.origen)
    destino_obj = find_destino(data, args.destino)
    
    if not origen_obj:
        print(f"Error: Origen '{args.origen}' no encontrado en los datos.")
        print("Ejemplos disponibles:", ", ".join([d['nombre_destino'] for d in data if isinstance(d, dict)][:5]))
        return
        
    if not destino_obj:
        print(f"Error: Destino '{args.destino}' no encontrado en los datos.")
        print("Ejemplos disponibles:", ", ".join([d['nombre_destino'] for d in data if isinstance(d, dict)][:5]))
        return
        
    print(f"\n--- SIMULACIÓN DE RUTA ---")
    print(f"ORIGEN : {origen_obj['nombre_destino']} ({origen_obj['tipo']})")
    print(f"DESTINO: {destino_obj['nombre_destino']} ({destino_obj['tipo']})")
    print(f"INGRESO FÍSICO: {args.dia.capitalize()} a las {args.hora}")
    print("--------------------------")
    
    print(">> EVALUACIÓN 1: Ingreso Oficial en Origen")
    ingreso_oficial = calcular_ingreso_oficial(origen_obj, args.dia, args.hora)
    
    if not ingreso_oficial:
        print("Error: No se pudo determinar un día hábil de ingreso para el origen.")
        return
        
    print(f"Ingreso Oficial Fijado: {ingreso_oficial.upper()}")
    print("")
    
    print(">> EVALUACIÓN 2: Cálculo de ETA en Destino")
    eta = calcular_eta(destino_obj, ingreso_oficial)
    print(f"DÍA ESTIMADO DE LLEGADA (ETA): {eta.upper()}")
    print("--------------------------\n")

if __name__ == '__main__':
    main()
