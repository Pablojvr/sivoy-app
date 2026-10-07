const { decodeCursor, encodeCursor, queryFingerprint } = require('./catalog-cursor');
const { decodeFacetCursor, encodeFacetCursor } = require('./catalog-facet-cursor');
const { CatalogError } = require('../../domains/catalog/catalog.validation');

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const TIME_ZONE = 'America/El_Salvador';

function createCatalogQueryService({ repository, cache, now = () => new Date() }) {
  if (!repository || typeof repository.getRevision !== 'function' ||
      typeof repository.listPoints !== 'function') {
    throw new TypeError('Catalog repository is invalid');
  }
  if (!cache || typeof cache.get !== 'function' || typeof cache.set !== 'function') {
    throw new TypeError('Catalog cache is invalid');
  }

  async function listPoints(query) {
    const revision = await repository.getRevision(query.companyId);
    const position = query.cursor
      ? decodeCursor(query.cursor, { revision, query })
      : null;
    const cacheKey = `catalog:v1:${query.companyId || 'all'}:${revision}:${queryFingerprint(query)}:${query.cursor || 'first'}`;
    let staticPage = await cache.get(cacheKey);
    if (!staticPage) {
      staticPage = await repository.listPoints({ ...query, position });
      await cache.set(cacheKey, staticPage, 300);
    }

    const evaluatedAt = now();
    const data = staticPage.points.map((point) => presentPoint(point, evaluatedAt));
    const last = staticPage.points.at(-1);
    const nextCursor = staticPage.hasMore && last
      ? encodeCursor({
          revision,
          query,
          position: { normalizedName: last.normalizedName, pointId: last.pointId }
        })
      : null;

    return {
      data,
      page: { limit: query.limit, hasMore: staticPage.hasMore, nextCursor },
      meta: { catalogRevision: revision }
    };
  }

  async function getPointDetails(pointId) {
    if (typeof repository.getPointDetails !== 'function') {
      throw new TypeError('Catalog repository does not support point details');
    }
    const revision = await repository.getRevision();
    const cacheKey = `catalog:v1:point:${revision}:${pointId}`;
    let point = await cache.get(cacheKey);
    if (!point) {
      point = await repository.getPointDetails(pointId);
      if (!point) {
        throw new CatalogError(404, 'POINT_NOT_FOUND', 'No encontramos el punto solicitado.');
      }
      await cache.set(cacheKey, point, 300);
    }

    const schedules = (point.schedules || []).map((schedule) => ({ ...schedule }));
    return {
      ...presentPoint(point, now()),
      schedules
    };
  }

  async function listFacets(query) {
    if (typeof repository.listFacets !== 'function') {
      throw new TypeError('Catalog repository does not support facets');
    }
    const revision = await repository.getRevision(query.companyId);
    const position = query.cursor
      ? decodeFacetCursor(query.cursor, { revision, query })
      : null;
    const cacheKey = `catalog:v1:facet:${query.companyId || 'all'}:${revision}:${queryFingerprint(query)}:${query.cursor || 'first'}`;
    let staticPage = await cache.get(cacheKey);
    if (!staticPage) {
      staticPage = await repository.listFacets({ ...query, position });
      await cache.set(cacheKey, staticPage, 300);
    }
    const last = staticPage.items.at(-1);
    const nextCursor = staticPage.hasMore && last
      ? encodeFacetCursor({
          revision,
          query,
          position: { normalizedLabel: last.normalizedLabel, value: last.cursorKey }
        })
      : null;
    const data = staticPage.items.map(({ normalizedLabel, cursorKey, ...item }) => item);
    return {
      data,
      page: { limit: query.limit, hasMore: staticPage.hasMore, nextCursor },
      meta: { catalogRevision: revision }
    };
  }

  return { getPointDetails, listFacets, listPoints };
}

function presentPoint(point, instant) {
  const { schedules, normalizedName, ...publicPoint } = point;
  return {
    ...publicPoint,
    availability: availabilityFor(schedules, instant),
    schedulePreview: groupSchedules(schedules).slice(0, 2)
  };
}

function groupSchedules(schedules) {
  const byDay = new Map(DAYS.map((day) => [day, []]));
  for (const schedule of schedules || []) {
    if (!byDay.has(schedule.day)) continue;
    byDay.get(schedule.day).push({ opensAt: schedule.opensAt, closesAt: schedule.closesAt });
  }
  const signatures = DAYS.map((day) => {
    const intervals = byDay.get(day).sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    return { day, intervals, signature: JSON.stringify(intervals) };
  });

  const groups = [];
  for (const entry of signatures) {
    if (entry.intervals.length === 0) continue;
    const previous = groups.at(-1);
    const expectedIndex = previous ? DAYS.indexOf(previous.days.at(-1)) + 1 : -1;
    if (previous && previous.signature === entry.signature && DAYS[expectedIndex] === entry.day) {
      previous.days.push(entry.day);
    } else {
      groups.push({ days: [entry.day], intervals: entry.intervals, signature: entry.signature });
    }
  }

  return groups.flatMap((group) => group.intervals.map((interval) => ({
    daysLabel: daysLabel(group.days),
    opensAt: interval.opensAt,
    closesAt: interval.closesAt
  })));
}

function daysLabel(days) {
  if (days.length === 1) return days[0];
  return `${days[0]} a ${days.at(-1).toLocaleLowerCase('es-SV')}`;
}

function localParts(instant) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23', weekday: 'long'
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    iso: `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}:${values.second}-06:00`,
    dayIndex: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(values.weekday)
  };
}

function availabilityFor(schedules, instant) {
  const local = localParts(instant);
  const day = DAYS[local.dayIndex];
  const current = minutes(local.time);
  const intervals = (schedules || []).filter((item) => item.day === day);
  const open = intervals.find((item) => current >= minutes(item.opensAt) && current < minutes(item.closesAt));
  return {
    status: open ? 'OPEN' : 'CLOSED',
    closesAt: open ? open.closesAt : null,
    nextOpeningAt: open ? null : findNextOpening(schedules, local),
    evaluatedAt: local.iso,
    timeZone: TIME_ZONE
  };
}

function findNextOpening(schedules, local) {
  const [year, month, day] = local.date.split('-').map(Number);
  const current = minutes(local.time);
  for (let offset = 0; offset <= 7; offset += 1) {
    const dayName = DAYS[(local.dayIndex + offset) % DAYS.length];
    const intervals = (schedules || [])
      .filter((item) => item.day === dayName)
      .sort((left, right) => left.opensAt.localeCompare(right.opensAt));
    const next = intervals.find((item) => offset > 0 || minutes(item.opensAt) > current);
    if (!next) continue;

    const date = new Date(Date.UTC(year, month - 1, day + offset));
    const dateOnly = [
      date.getUTCFullYear(),
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0')
    ].join('-');
    return `${dateOnly}T${next.opensAt}:00-06:00`;
  }
  return null;
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

module.exports = {
  availabilityFor,
  createCatalogQueryService,
  groupSchedules,
  presentPoint
};
