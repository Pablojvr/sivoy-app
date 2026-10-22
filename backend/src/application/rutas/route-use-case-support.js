function resolveDropoffDateTime(payload, now) {
  const { dropoff_date, dropoff_time } = payload;
  if (dropoff_date && dropoff_time) {
    return { dropoff_date, dropoff_time };
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError('A valid clock value is required for default dropoff time');
  }
  return {
    dropoff_date: now.toISOString().split('T')[0],
    dropoff_time: now.toTimeString().split(' ')[0].substring(0, 5)
  };
}

function candidateDropoffs(startDate, firstTime) {
  const dropoffs = [];
  const currentDate = new Date(startDate + 'T00:00:00');
  for (let day = 0; day < 7; day++) {
    dropoffs.push({
      dropoff_date: currentDate.toISOString().split('T')[0],
      dropoff_time: day === 0 ? firstTime : '08:00'
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dropoffs;
}

function filterByArrivalDate(options, arrivalDate) {
  if (!arrivalDate) return [...options];
  const limitTime = new Date(arrivalDate + 'T23:59:59').getTime();
  return options.filter(option =>
    new Date(option.fecha_llegada_iso + 'T00:00:00').getTime() <= limitTime
  );
}

module.exports = {
  resolveDropoffDateTime,
  candidateDropoffs,
  filterByArrivalDate
};
