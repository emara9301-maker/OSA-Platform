import { t, type Lang } from "@/lib/messages";
import { timeUntil } from "@/lib/class-time";

const hour = 60 * 60 * 1000;

// "2 days and 1 hour until the class", or the hours alone, or "less than an hour".
// The colour changes as the class gets close: amber within a day, red within an hour.
export function ClassCountdown({ lang, start, now }: { lang: Lang; start: number; now: number }) {
  const { days, hours } = timeUntil(start, now);
  const dayUnit = t(lang, days === 1 ? "unitDay" : "unitDays");
  const hourUnit = t(lang, hours === 1 ? "unitHour" : "unitHours");
  const text =
    days > 0
      ? t(lang, "countdownDays", { days, dayUnit, hours, hourUnit })
      : hours > 0
        ? t(lang, "countdownHours", { hours, hourUnit })
        : t(lang, "countdownSoon");
  const urgency = start - now < hour ? "countdown-soon" : start - now < 24 * hour ? "countdown-today" : "";
  return <span className={`countdown ${urgency}`}>{text}</span>;
}
