$baseDir = "C:\Users\Javier\.gemini\antigravity\brain\24c169e7-3863-408f-a738-def72cebf73f\scratch"
$jsonFiles = Get-ChildItem -Path $baseDir -Filter "norm_raw_*.json"

$allData = @()
foreach ($file in $jsonFiles) {
    $jsonString = Get-Content -Raw -Path $file.FullName -Encoding UTF8
    $data = $jsonString | ConvertFrom-Json
    $allData += $data
}

# Sort data
$allData = $allData | Sort-Object -Property nombre_destino

$destinosSql = @()
$horariosSql = @()
$reglasSql = @()

$id_horario = 1
$id_regla = 1

function Escape-Sql([string]$val) {
    if ([string]::IsNullOrEmpty($val)) {
        return "NULL"
    }
    return "'" + $val.Replace("'", "''") + "'"
}

foreach ($d in $allData) {
    $id_destino_val = $d.id_destino
    if ([string]::IsNullOrEmpty($id_destino_val)) { continue }
    
    $id_destino = Escape-Sql $id_destino_val
    $nombre_destino = Escape-Sql $d.nombre_destino
    $tipo = Escape-Sql $d.tipo
    
    $depto = "NULL"
    $muni = "NULL"
    $dir_ref = "NULL"
    
    if ($null -ne $d.ubicacion) {
        $depto = Escape-Sql $d.ubicacion.departamento
        $muni = Escape-Sql $d.ubicacion.municipio
        $dir_ref = Escape-Sql $d.ubicacion.direccion_referencia
    }
    
    $destinosSql += "INTO DESTINOS (id_destino, nombre_destino, tipo, departamento, municipio, direccion_referencia) VALUES ($id_destino, $nombre_destino, $tipo, $depto, $muni, $dir_ref)"
    
    if ($null -ne $d.horarios_operativos) {
        foreach ($h in $d.horarios_operativos) {
            $dia_semana = Escape-Sql $h.dia_semana
            $hora_aper = Escape-Sql $h.hora_apertura
            $hora_cierre = Escape-Sql $h.hora_cierre
            $horariosSql += "INTO HORARIOS_OPERATIVOS (id_horario, id_destino, dia_semana, hora_apertura, hora_cierre) VALUES ($id_horario, $id_destino, $dia_semana, $hora_aper, $hora_cierre)"
            $id_horario++
        }
    }
    
    if ($null -ne $d.reglas_entrega) {
        foreach ($r in $d.reglas_entrega) {
            $dia_ent = Escape-Sql $r.dia_entrega
            $dia_corte = Escape-Sql $r.dia_corte_maximo
            $reglasSql += "INTO REGLAS_ENTREGA (id_regla, id_destino, dia_entrega, dia_corte_maximo) VALUES ($id_regla, $id_destino, $dia_ent, $dia_corte)"
            $id_regla++
        }
    }
}

$outPath = "C:\Users\Javier\.gemini\antigravity\brain\24c169e7-3863-408f-a738-def72cebf73f\inserts_logistica_v2.sql"
"-- POBLADO DE DATOS (DML) - LOGISTICA V2`r`n" | Out-File -FilePath $outPath -Encoding UTF8

"INSERT ALL" | Out-File -FilePath $outPath -Encoding UTF8 -Append
$destinosSql | Out-File -FilePath $outPath -Encoding UTF8 -Append
"SELECT 1 FROM DUAL;`r`n" | Out-File -FilePath $outPath -Encoding UTF8 -Append

"INSERT ALL" | Out-File -FilePath $outPath -Encoding UTF8 -Append
$horariosSql | Out-File -FilePath $outPath -Encoding UTF8 -Append
"SELECT 1 FROM DUAL;`r`n" | Out-File -FilePath $outPath -Encoding UTF8 -Append

"INSERT ALL" | Out-File -FilePath $outPath -Encoding UTF8 -Append
$reglasSql | Out-File -FilePath $outPath -Encoding UTF8 -Append
"SELECT 1 FROM DUAL;`r`n" | Out-File -FilePath $outPath -Encoding UTF8 -Append

Write-Host "Generated SQL at $outPath"
