import { SearchRouteItem } from './shipment-search.models';

function getLocalYYYYMMDD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const DROPOFF_MSG_REGEX = /a\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i;

function parseDropoffTime(msg: string): { h: number; m: number } | null {
  const match = msg.match(DROPOFF_MSG_REGEX);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3];

  if (ampm) {
    const upperAmpm = ampm.toUpperCase();
    if (upperAmpm === 'PM' && h < 12) {
      h += 12;
    } else if (upperAmpm === 'AM' && h === 12) {
      h = 0;
    }
  }

  if (Number.isNaN(h) || Number.isNaN(m)) return null;

  return { h, m };
}

export function applyClosedDropoffFilter(items: readonly SearchRouteItem[], now: Date): SearchRouteItem[] {
  const todayStr = getLocalYYYYMMDD(now);
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  let modified = false;

  const newItems = items.map(item => {
    let optionRemoved = false;

    const validOptions = item.route.options.filter(opt => {
       if (opt.dropoffDate === todayStr && opt.dropoffMessage) {
         const time = parseDropoffTime(opt.dropoffMessage);
         if (time && (currentHour > time.h || (currentHour === time.h && currentMinute > time.m))) {
           optionRemoved = true;
           return false;
         }
       }
       return true;
    });

    if (!optionRemoved) {
      return item;
    }

    modified = true;

    let newIndex = 0;
    const prevSelected = item.presentation.selectedOption;
    if (prevSelected) {
      const foundIndex = validOptions.indexOf(prevSelected);
      if (foundIndex !== -1) {
        newIndex = foundIndex;
      }
    }

    return {
      ...item,
      route: {
        ...item.route,
        options: validOptions
      },
      presentation: {
        ...item.presentation,
        hasClosedAlert: true,
        selectedOptionIndex: validOptions.length > 0 ? newIndex : 0,
        selectedOption: validOptions.length > 0 ? validOptions[newIndex] : null
      }
    };
  });

  return modified ? newItems : [...items];
}