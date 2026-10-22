export interface RawSchedule {
  dia_semana?: string | null;
  hora_apertura?: string | null;
  hora_cierre?: string | null;
}

export interface GroupedSchedule {
  dias: string;
  apertura: string;
  cierre: string;
}

export function formatScheduleTime(timeStr?: string | null): string {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':');
  if (!hours || !minutes) return '';
  let h = parseInt(hours, 10);
  if (isNaN(h)) return '';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h < 10 ? '0' + h : h}:${minutes} ${ampm}`;
}

export function groupConsecutiveSchedules(horarios?: RawSchedule[] | null): GroupedSchedule[] {
  if (!horarios || !Array.isArray(horarios) || horarios.length === 0) return [];
  const dayOrder = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  
  // 1. Group by time
  const timeGroups: { [key: string]: { apertura: string, cierre: string, days: Set<number> } } = {};
  
  for (const h of horarios) {
    if (!h.hora_apertura || !h.hora_cierre || !h.dia_semana) continue;
    const key = `${h.hora_apertura}-${h.hora_cierre}`;
    const dayIndex = dayOrder.indexOf(h.dia_semana);
    if (dayIndex === -1) continue;
    
    if (!timeGroups[key]) {
      timeGroups[key] = { apertura: h.hora_apertura, cierre: h.hora_cierre, days: new Set<number>() };
    }
    timeGroups[key].days.add(dayIndex);
  }
  
  const result: GroupedSchedule[] = [];
  
  // 2. For each time group, find consecutive ranges
  for (const key in timeGroups) {
    const group = timeGroups[key];
    // Sort days
    const daysArray = Array.from(group.days).sort((a, b) => a - b);
    
    const ranges: string[] = [];
    let rangeStart = daysArray[0];
    let rangeEnd = daysArray[0];
    
    for (let i = 1; i < daysArray.length; i++) {
      if (daysArray[i] === rangeEnd + 1) {
        rangeEnd = daysArray[i];
      } else {
        if (rangeStart === rangeEnd) {
          ranges.push(dayOrder[rangeStart]);
        } else if (rangeEnd === rangeStart + 1) {
          ranges.push(`${dayOrder[rangeStart]} y ${dayOrder[rangeEnd]}`);
        } else {
          ranges.push(`${dayOrder[rangeStart]} a ${dayOrder[rangeEnd]}`);
        }
        rangeStart = daysArray[i];
        rangeEnd = daysArray[i];
      }
    }
    
    if (rangeStart === rangeEnd) {
      ranges.push(dayOrder[rangeStart]);
    } else if (rangeEnd === rangeStart + 1) {
      ranges.push(`${dayOrder[rangeStart]} y ${dayOrder[rangeEnd]}`);
    } else {
      ranges.push(`${dayOrder[rangeStart]} a ${dayOrder[rangeEnd]}`);
    }
    
    // Join ranges with commas
    let diasLabel = ranges.join(', ');
    
    result.push({ dias: diasLabel, apertura: group.apertura, cierre: group.cierre });
  }
  
  // Sort result by the first day of the group
  result.sort((a, b) => {
     const getFirstDay = (label: string) => {
        for (let i = 0; i < dayOrder.length; i++) {
          if (label.includes(dayOrder[i])) return i;
        }
        return 99;
     };
     return getFirstDay(a.dias) - getFirstDay(b.dias);
  });
  
  return result;
}
