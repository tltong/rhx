const {fail} = require("../../news_article/domain/news_article");
function timeZone(value) {
  if (typeof value !== "string" || value.length > 100) throw fail("Provide the student's IANA timezone.");
  try {return new Intl.DateTimeFormat("en", {timeZone: value}).resolvedOptions().timeZone;} catch {throw fail("Choose a valid IANA timezone.");}
}
function dayWindow(now, zone) {
  zone = timeZone(zone);
  const format = new Intl.DateTimeFormat("en-CA", {timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit"});
  const localDate = value => {const parts = Object.fromEntries(format.formatToParts(new Date(value)).map(part => [part.type, part.value])); return `${parts.year}-${parts.month}-${parts.day}`;};
  const current = now.getTime(), date = localDate(current);
  let low = current - 36 * 3600000, high = current;
  while (high - low > 1) {const middle = Math.floor((low + high) / 2); if (localDate(middle) === date) high = middle; else low = middle;}
  const start = high; low = current; high = current + 36 * 3600000;
  while (high - low > 1) {const middle = Math.floor((low + high) / 2); if (localDate(middle) === date) low = middle; else high = middle;}
  return {localDate: date, timeZone: zone, windowStartAt: new Date(start), windowEndAt: new Date(high)};
}
module.exports = {timeZone, dayWindow};
