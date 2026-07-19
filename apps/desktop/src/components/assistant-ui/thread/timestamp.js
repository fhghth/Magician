import { fmtClock, fmtDayTime } from '@/lib/time';
function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
export function formatMessageTimestamp(value, labels) {
    if (!value) {
        return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const dayDelta = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
    if (dayDelta === 0) {
        return labels.today(fmtClock.format(date));
    }
    if (dayDelta === 1) {
        return labels.yesterday(fmtClock.format(date));
    }
    return fmtDayTime.format(date);
}
