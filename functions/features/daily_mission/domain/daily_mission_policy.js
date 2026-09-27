const PAUSED_TOPIC_VALIDITY_DAYS = 14;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDateKey(value, fieldName) {
  const date = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`${fieldName} must use YYYY-MM-DD format.`);
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new Error(`${fieldName} must be a valid calendar date.`);
  }

  return parsed;
}

function pausedTopicAgeInDays(pausedDate, currentDate) {
  const pausedAt = parseDateKey(pausedDate, "pausedDate");
  const currentAt = parseDateKey(currentDate, "currentDate");

  return Math.floor(
    (currentAt.getTime() - pausedAt.getTime()) / MILLISECONDS_PER_DAY,
  );
}

function isPausedTopicExpired(pausedDate, currentDate) {
  return pausedTopicAgeInDays(pausedDate, currentDate)
    > PAUSED_TOPIC_VALIDITY_DAYS;
}

module.exports = {
  PAUSED_TOPIC_VALIDITY_DAYS,
  isPausedTopicExpired,
  pausedTopicAgeInDays,
};
