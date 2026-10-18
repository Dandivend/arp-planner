// US holidays and fun observances for the calendar, worked out for any year.

function nthWeekday(y, m, weekday, n) {          // e.g. 4th Thursday of November
  const first = new Date(y, m, 1);
  return new Date(y, m, 1 + ((weekday - first.getDay() + 7) % 7) + (n - 1) * 7);
}
function lastWeekday(y, m, weekday) {             // e.g. last Monday of May
  const last = new Date(y, m + 1, 0);
  return new Date(y, m, last.getDate() - ((last.getDay() - weekday + 7) % 7));
}
function easterSunday(y) {                        // Anonymous Gregorian algorithm
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

const holidayCache = {};
function holidaysFor(y) {
  if (holidayCache[y]) return holidayCache[y];
  const H = {};
  const add = (date, name, emoji, color) => { H[toKey(date)] = { name, emoji, color }; };
  const fixed = (m, d) => new Date(y, m - 1, d);
  add(fixed(1, 1), "New Year's Day", "🎆", "#7c6cf0");
  add(nthWeekday(y, 0, 1, 3), "Martin Luther King Jr. Day", "✊", "#5b8def");
  add(fixed(2, 14), "Valentine's Day", "💘", "#ef5a8a");
  add(nthWeekday(y, 1, 1, 3), "Presidents' Day", "🇺🇸", "#5b8def");
  add(fixed(3, 17), "St. Patrick's Day", "☘️", "#3fbf6a");
  add(easterSunday(y), "Easter", "🐣", "#f2c94c");
  add(nthWeekday(y, 4, 0, 2), "Mother's Day", "💐", "#ef7aa8");
  add(lastWeekday(y, 4, 1), "Memorial Day", "🇺🇸", "#5b8def");
  add(nthWeekday(y, 5, 0, 3), "Father's Day", "👔", "#5bb0ef");
  add(fixed(6, 19), "Juneteenth", "✊🏾", "#e0a040");
  add(fixed(7, 4), "Independence Day", "🎆", "#ef5a5a");
  add(nthWeekday(y, 8, 1, 1), "Labor Day", "🛠️", "#5b8def");
  add(nthWeekday(y, 9, 1, 2), "Indigenous Peoples' / Columbus Day", "🍂", "#d98a3a");
  add(fixed(10, 31), "Halloween", "🎃", "#f08a24");
  add(fixed(11, 11), "Veterans Day", "🎖️", "#5b8def");
  add(nthWeekday(y, 10, 4, 4), "Thanksgiving", "🦃", "#d98a3a");
  add(fixed(12, 24), "Christmas Eve", "🎄", "#3fbf6a");
  add(fixed(12, 25), "Christmas", "🎄", "#ef5a5a");
  add(fixed(12, 31), "New Year's Eve", "🥂", "#7c6cf0");
  return (holidayCache[y] = H);
}

const holidayOn = key => holidaysFor(Number(key.slice(0, 4)))[key] || null;
