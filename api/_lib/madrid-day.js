// Ventana de calendario «hoy» en Europe/Madrid (00:00 local → ahora).

export const MADRID_TZ = 'Europe/Madrid';

function tzOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') parts[p.type] = p.value;
  }
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - date.getTime();
}

/** YYYY-MM-DD en Europe/Madrid */
export function madridYmd(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Inicio del día civil en Madrid (instante UTC). */
export function madridStartOfDay(now = new Date()) {
  const ymd = madridYmd(now);
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  const guess = new Date(utcMidnight.getTime() - tzOffsetMs(utcMidnight, MADRID_TZ));
  return new Date(utcMidnight.getTime() - tzOffsetMs(guess, MADRID_TZ));
}

/** { start, end, ymd } — «hoy» = [00:00 Madrid, ahora] */
export function madridTodayWindow(now = new Date()) {
  return {
    start: madridStartOfDay(now),
    end: now,
    ymd: madridYmd(now),
    timeZone: MADRID_TZ,
  };
}

export function isInMadridToday(date, now = new Date()) {
  const t = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(t.getTime())) return false;
  const { start, end } = madridTodayWindow(now);
  return t >= start && t <= end;
}
