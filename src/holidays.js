/* Built-in holiday calendars are Google's public holiday ICS feeds — the
   same curated style Apple uses, so they show the traditional dates (e.g.
   Battle of the Boyne on 12 July, Independence Day on 4 July) with explicit
   "(substitute day)"/"(observed)" entries, rather than only the shifted
   bank-holiday dates that holiday APIs like Nager report. Fetched through
   the ICS pipeline like any other subscription. */

export const HOLIDAY_CALENDARS = [
  { code: "US", name: "United States", tz: "America/New_York", color: "red" },
  { code: "GB", name: "United Kingdom", tz: "Europe/London", color: "blue" },
  { code: "JP", name: "Japan", tz: "Asia/Tokyo", color: "red" },
  { code: "CN", name: "China", tz: "Asia/Shanghai", color: "red" },
  { code: "KR", name: "South Korea", tz: "Asia/Seoul", color: "blue" },
  { code: "HK", name: "Hong Kong", tz: "Asia/Hong_Kong", color: "red" },
  { code: "TW", name: "Taiwan", tz: "Asia/Taipei", color: "red" },
  { code: "SG", name: "Singapore", tz: "Asia/Singapore", color: "red" },
  { code: "AU", name: "Australia", tz: "Australia/Sydney", color: "green" },
  { code: "CA", name: "Canada", tz: "America/Toronto", color: "red" },
  { code: "DE", name: "Germany", tz: "Europe/Berlin", color: "orange" },
  { code: "FR", name: "France", tz: "Europe/Paris", color: "blue" },
  { code: "IN", name: "India", tz: "Asia/Kolkata", color: "orange" },
  { code: "IT", name: "Italy", tz: "Europe/Rome", color: "green" },
  { code: "ES", name: "Spain", tz: "Europe/Madrid", color: "orange" },
  { code: "MX", name: "Mexico", tz: "America/Mexico_City", color: "green" },
  { code: "BR", name: "Brazil", tz: "America/Sao_Paulo", color: "green" },
  { code: "NL", name: "Netherlands", tz: "Europe/Amsterdam", color: "orange" },
];

export const calByCode = (code) => HOLIDAY_CALENDARS.find((c) => c.code === code);

/* Guess the user's country from the device timezone, so we can default
   both the holiday calendar and the new-event timezone sensibly. */
export function guessCountry() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const hit = HOLIDAY_CALENDARS.find((c) => c.tz === tz);
  if (hit) return hit.code;
  const region = tz.split("/")[0];
  const byRegion = { Europe: "GB", America: "US", Asia: "JP", Australia: "AU" };
  return byRegion[region] || "US";
}

const GOOGLE_TOKENS = {
  US: "usa", GB: "uk", JP: "japanese", CN: "china", KR: "south_korea",
  HK: "hong_kong", TW: "taiwan", SG: "singapore", AU: "australian",
  CA: "canadian", DE: "german", FR: "french", IN: "indian", IT: "italian",
  ES: "spain", MX: "mexican", BR: "brazilian", NL: "dutch",
};

export function holidayFeedUrl(code) {
  const token = GOOGLE_TOKENS[code] || "usa";
  return `https://calendar.google.com/calendar/ical/en.${token}%23holiday%40group.v.calendar.google.com/public/basic.ics`;
}
