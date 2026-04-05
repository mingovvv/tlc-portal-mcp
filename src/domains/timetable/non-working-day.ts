import type { PortalConfig } from "../../core/config.js";

const STATIC_KR_PUBLIC_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-02-16": "Lunar New Year Holiday",
  "2026-02-17": "Lunar New Year",
  "2026-02-18": "Substitute Holiday",
  "2026-03-01": "Independence Movement Day",
  "2026-03-02": "Substitute Holiday",
  "2026-05-05": "Children's Day",
  "2026-05-24": "Buddha's Birthday",
  "2026-06-06": "Memorial Day",
  "2026-08-15": "Liberation Day",
  "2026-08-17": "Substitute Holiday",
  "2026-09-24": "Chuseok Holiday",
  "2026-09-25": "Chuseok",
  "2026-09-26": "Chuseok Holiday",
  "2026-10-03": "National Foundation Day",
  "2026-10-05": "Substitute Holiday",
  "2026-10-09": "Hangeul Day",
  "2026-12-25": "Christmas Day",
};

type HolidayApiItem = {
  date: string;
  localName?: string;
  name?: string;
};

export type NonWorkingDayResult =
  | { kind: "company_closure"; name: string; source: "config" }
  | { kind: "public_holiday"; name: string; source: "api" | "static" }
  | { kind: "weekend"; name: string; source: "local" }
  | null;

const holidayCache = new Map<number, Map<string, string>>();
const failedHolidayYears = new Set<number>();

function getWeekendName(workDate: string): string | null {
  const day = new Date(`${workDate}T00:00:00`).getDay();
  if (day === 0) return "Sunday";
  if (day === 6) return "Saturday";
  return null;
}

function getStaticHolidayMap(year: number): Map<string, string> {
  const result = new Map<string, string>();
  for (const [date, name] of Object.entries(STATIC_KR_PUBLIC_HOLIDAYS)) {
    if (date.startsWith(`${year}-`)) {
      result.set(date, name);
    }
  }
  return result;
}

async function getHolidayMapFromApi(
  year: number,
  config: PortalConfig
): Promise<Map<string, string> | null> {
  if (holidayCache.has(year)) {
    return holidayCache.get(year)!;
  }
  if (failedHolidayYears.has(year)) {
    return null;
  }

  const url = `${config.holidayApiBaseUrl.replace(/\/$/, "")}/PublicHolidays/${year}/KR`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      failedHolidayYears.add(year);
      return null;
    }

    const payload = (await response.json()) as HolidayApiItem[];
    const holidayMap = new Map<string, string>();
    for (const item of payload) {
      if (!item.date) continue;
      holidayMap.set(item.date, item.localName || item.name || "Public Holiday");
    }

    holidayCache.set(year, holidayMap);
    return holidayMap;
  } catch {
    failedHolidayYears.add(year);
    return null;
  }
}

export async function resolveNonWorkingDay(
  workDate: string,
  config: PortalConfig
): Promise<NonWorkingDayResult> {
  if (config.companyHolidays.includes(workDate)) {
    return {
      kind: "company_closure",
      name: "Company closure",
      source: "config",
    };
  }

  const year = Number(workDate.slice(0, 4));
  const apiHolidayMap = await getHolidayMapFromApi(year, config);
  const apiHolidayName = apiHolidayMap?.get(workDate);
  if (apiHolidayName) {
    return {
      kind: "public_holiday",
      name: apiHolidayName,
      source: "api",
    };
  }

  const staticHolidayName = getStaticHolidayMap(year).get(workDate);
  if (staticHolidayName) {
    return {
      kind: "public_holiday",
      name: staticHolidayName,
      source: "static",
    };
  }

  const weekendName = getWeekendName(workDate);
  if (weekendName) {
    return {
      kind: "weekend",
      name: weekendName,
      source: "local",
    };
  }

  return null;
}
