const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const {
  resolveDropoffDateTime,
  candidateDropoffs,
  filterByArrivalDate
} = require('../src/application/rutas/route-use-case-support');

test('uses an injected instant for the paired legacy UTC-date and local-time defaults', () => {
  const now = new Date('2026-09-16T12:34:56.000Z');
  const payload = Object.freeze({ dropoff_date: '2026-09-10' });
  const expectedTime = now.toTimeString().split(' ')[0].substring(0, 5);

  assert.deepEqual(resolveDropoffDateTime(payload, now), {
    dropoff_date: '2026-09-16',
    dropoff_time: expectedTime
  });
  assert.deepEqual(payload, { dropoff_date: '2026-09-10' });
  assert.deepEqual(resolveDropoffDateTime({
    dropoff_date: '2026-09-10',
    dropoff_time: '14:30'
  }, now), { dropoff_date: '2026-09-10', dropoff_time: '14:30' });
});

test('returns seven candidate days with the submitted time only on the first', () => {
  const result = candidateDropoffs('2026-12-29', '15:45');
  assert.equal(result.length, 7);
  assert.deepEqual(result[0], { dropoff_date: '2026-12-29', dropoff_time: '15:45' });
  assert.deepEqual(result[1], { dropoff_date: '2026-12-30', dropoff_time: '08:00' });
  assert.deepEqual(result[6], { dropoff_date: '2027-01-04', dropoff_time: '08:00' });
});

test('keeps arrivals on the limit day and does not mutate a frozen options array', () => {
  const options = Object.freeze([
    Object.freeze({ fecha_llegada_iso: '2026-09-16', id: 'before' }),
    Object.freeze({ fecha_llegada_iso: '2026-09-17', id: 'same' }),
    Object.freeze({ fecha_llegada_iso: '2026-09-18', id: 'after' })
  ]);
  assert.deepEqual(filterByArrivalDate(options, '2026-09-17').map(option => option.id), ['before', 'same']);
  assert.deepEqual(filterByArrivalDate(options, undefined), options);
});

test('matches the legacy date and time rules in three host time zones', () => {
  const script = `
    const support = require('./src/application/rutas/route-use-case-support');
    const start = '2026-12-29';
    const current = new Date(start + 'T00:00:00');
    const expected = [];
    for (let i = 0; i < 7; i++) {
      expected.push({
        dropoff_date: current.toISOString().split('T')[0],
        dropoff_time: i === 0 ? '15:45' : '08:00'
      });
      current.setDate(current.getDate() + 1);
    }
    const now = new Date('2026-12-31T23:30:00.000Z');
    const defaults = support.resolveDropoffDateTime({}, now);
    if (JSON.stringify(support.candidateDropoffs(start, '15:45')) !== JSON.stringify(expected)) process.exit(1);
    if (defaults.dropoff_date !== now.toISOString().split('T')[0]) process.exit(2);
    if (defaults.dropoff_time !== now.toTimeString().split(' ')[0].substring(0, 5)) process.exit(3);
  `;

  for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: require('node:path').join(__dirname, '..'),
      env: { ...process.env, TZ: zone },
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, `${zone}: ${result.stderr}`);
  }
});
