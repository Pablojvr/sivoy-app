import json
import glob
import os
import argparse
from datetime import datetime, timedelta

# Diccionario de Días (Índice de datetime.weekday() a String)
IDX_TO_DIA = {0: "Lunes", 1: "Martes", 2: "Miércoles", 3: "Jueves", 4: "Viernes", 5: "Sábado", 6: "Domingo"}

def get_dia_from_date(dt):
    return IDX_TO_DIA[dt.weekday()]

def get_day_index_from_string(dia_str):
    for k, v in IDX_TO_DIA.items():
        if v.lower() == dia_str.lower():
            return k
    return -1

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
        if not isinstance(d, dict): continue
        if d.get('nombre_destino', '').lower() == nombre_lower or d.get('id_destino', '').lower() == nombre_lower:
            return d
    return None

def calcular_ingreso_oficial(origen, fecha_dropoff, hora_dropoff):
    """
    Calcula el objeto datetime exacto en el que el paquete "ingresa" formalmente al sistema.
    Si se entrega tarde o en día cerrado, se desplaza al siguiente día hábil del origen.
    """
    current_date = fecha_dropoff
    
    # Evaluar hoy (fecha_dropoff)
    dia_str = get_dia_from_date(current_date)
    horario_hoy = next((h for h in origen.get('horarios_operativos', []) if h['dia_semana'].lower() == dia_str.lower()), None)
    
    if horario_hoy and hora_dropoff <= horario_hoy['hora_cierre']:
        # Ingresó a tiempo
        return current_date, f"A tiempo el {dia_str} ({current_date.strftime('%Y-%m-%d')})"
    elif horario_hoy:
        motivo = f"Tarde (entregó a las {hora_dropoff}, cerraba a las {horario_hoy['hora_cierre']})"
    else:
        motivo = f"Cerrado el {dia_str}"
        
    # Buscar el próximo día hábil
    for _ in range(7):
        current_date += timedelta(days=1)
        dia_eval_str = get_dia_from_date(current_date)
        if any(h['dia_semana'].lower() == dia_eval_str.lower() for h in origen.get('horarios_operativos', [])):
            return current_date, f"Desplazado por ser {motivo}. Ingresa oficial: {dia_eval_str} ({current_date.strftime('%Y-%m-%d')})"
            
    return None, "Error: El origen no tiene días operativos"

def get_corte_date(fecha_deseada, regla_corte_str):
    """
    Dada la fecha de entrega deseada y la regla de corte en texto, 
    devuelve la fecha exacta del corte máximo.
    """
    regla_lower = regla_corte_str.lower()
    if regla_lower == 'día anterior' or regla_lower == 'dia anterior':
        return fecha_deseada - timedelta(days=1)
    elif regla_lower == 'mismo día' or regla_lower == 'mismo dia':
        return fecha_deseada
    else:
        # Es un día específico (ej. "Miércoles")
        target_weekday = get_day_index_from_string(regla_lower)
        if target_weekday == -1:
            # Fallback seguro
            return fecha_deseada - timedelta(days=1)
            
        # Retroceder días hasta encontrar el target_weekday
        corte_date = fecha_deseada - timedelta(days=1)
        while corte_date.weekday() != target_weekday:
            corte_date -= timedelta(days=1)
        return corte_date

def validar_fecha_deseada(destino, ingreso_oficial_date, fecha_deseada):
    """
    Verifica si una fecha exacta deseada es posible para el destino, 
    dado el ingreso oficial del paquete.
    """
    dia_deseado_str = get_dia_from_date(fecha_deseada)
    reglas = destino.get('reglas_entrega', [])
    
    # 1. ¿El destino recibe rutas en el día de la semana de la fecha deseada?
    regla_aplicable = None
    for r in reglas:
        entrega_str = r['dia_entrega'].lower()
        if entrega_str == 'diario' or entrega_str == dia_deseado_str.lower():
            regla_aplicable = r
            break
            
    if not regla_aplicable:
        return False, f"El destino no recibe entregas los días {dia_deseado_str}."
        
    # 2. Calcular la fecha exacta del corte máximo para ESA ruta futura
    corte_date = get_corte_date(fecha_deseada, regla_aplicable['dia_corte_maximo'])
    
    # 3. Validar si el Ingreso Oficial ocurre a tiempo (antes o el mismo día del corte)
    if ingreso_oficial_date <= corte_date:
        return True, f"Aprobado. Ingreso ({ingreso_oficial_date.strftime('%Y-%m-%d')}) es <= Corte ({corte_date.strftime('%Y-%m-%d')})."
    else:
        return False, f"Rechazado. El ingreso es ({ingreso_oficial_date.strftime('%Y-%m-%d')}) pero la ruta cortaba el ({corte_date.strftime('%Y-%m-%d')})."

def main():
    parser = argparse.ArgumentParser(description="Validador de Calendario Logístico Exacto")
    parser.add_argument("--origen", required=True, help="Nombre del destino de origen")
    parser.add_argument("--destino", required=True, help="Nombre del destino final")
    parser.add_argument("--fecha_dropoff", required=True, help="Fecha en que se deja el paquete (YYYY-MM-DD)")
    parser.add_argument("--hora_dropoff", required=True, help="Hora en que se deja (HH:MM, 24h)")
    parser.add_argument("--fecha_deseada", required=True, help="Fecha calendario exacta deseada de entrega (YYYY-MM-DD)")
    
    args = parser.parse_args()
    
    try:
        dt_dropoff = datetime.strptime(args.fecha_dropoff, '%Y-%m-%d')
        dt_deseada = datetime.strptime(args.fecha_deseada, '%Y-%m-%d')
    except ValueError:
        print("Error: Formato de fecha inválido. Usa YYYY-MM-DD.")
        return
        
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
        
    print("\n" + "="*50)
    print("MOTOR DE CALENDARIO LOGÍSTICO")
    print("="*50)
    print(f"Origen : {origen_obj['nombre_destino']}")
    print(f"Destino: {destino_obj['nombre_destino']}")
    print(f"Dropoff: {get_dia_from_date(dt_dropoff)} {dt_dropoff.strftime('%Y-%m-%d')} a las {args.hora_dropoff}")
    print(f"Deseada: {get_dia_from_date(dt_deseada)} {dt_deseada.strftime('%Y-%m-%d')}")
    print("-" * 50)
    
    # Eval. 1
    ingreso_oficial_date, msg_ingreso = calcular_ingreso_oficial(origen_obj, dt_dropoff, args.hora_dropoff)
    if not ingreso_oficial_date:
        print("ERROR EN ORIGEN:", msg_ingreso)
        return
    print(f"Paso 1 (Origen): {msg_ingreso}")
    
    # Eval. 2
    es_posible, msg_entrega = validar_fecha_deseada(destino_obj, ingreso_oficial_date, dt_deseada)
    if es_posible:
        print(f"Paso 2 (Destino): APROBADO - {msg_entrega}")
        print("\nLA FECHA HA SIDO ACEPTADA EN EL SISTEMA.")
    else:
        print(f"Paso 2 (Destino): RECHAZADO - {msg_entrega}")
        print("\nNO ES POSIBLE ENTREGAR EN ESA FECHA.")
    print("="*50 + "\n")

if __name__ == '__main__':
    main()
