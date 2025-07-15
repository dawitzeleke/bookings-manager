import { DateTime as LuxonDateTime } from "luxon";

export default class DateTime {
  /**
   * Identify the date format of a given string.
   * @param {string} dateStr
   * @returns {string|false} Date format string or false if not matched.
   */
  static identifyDateFormatFromString(dateStr) {
    if (typeof dateStr !== "string" || !dateStr.trim()) return false;

    dateStr = dateStr.trim();

    if (dateStr.includes(" ")) {
      return "Y-m-d H:i:s";
    }

    const dashCount = (dateStr.match(/-/g) || []).length;

    if (dashCount === 2) {
      const parts = dateStr.split("-");
      if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
        return "Y-m-d";
      }
    }

    if (dashCount === 1) {
      const parts = dateStr.split("-");
      if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
        return "Y-m";
      }
    }

    if (dateStr.length === 4 && /^\d{4}$/.test(dateStr)) {
      return "Y";
    }

    return false;
  }

  /**
   * Generate the current or offset timestamp in a given format and timezone.
   *
   * @param {string} format - Luxon format string (default: 'yyyy-MM-dd HH:mm:ss')
   * @param {string|number|null} interval - Relative time string (e.g., '+1 day') or UNIX timestamp
   * @param {string|null} timeZone - IANA timezone (e.g., 'Asia/Tokyo')
   * @returns {string}
   */
  static generateRelativeTimestamp(
    format = "yyyy-MM-dd HH:mm:ss",
    interval = null,
    timeZone = null
  ) {
    let dt = LuxonDateTime.now().setZone(timeZone || "Asia/Hong_Kong");

    if (typeof interval === "number") {
      dt = LuxonDateTime.fromSeconds(interval).setZone(
        timeZone || "Asia/Hong_Kong"
      );
    } else if (typeof interval === "string" && interval.trim()) {
      try {
        dt = dt.plus(this.parseIntervalToDuration(interval));
      } catch (e) {
        throw new Error("-- Invalid interval format --");
        // return false;
      }
    }

    return dt.toFormat(format);
  }

  /**
   * Convert a string like '+2 days' to a Luxon Duration object.
   * Supports 'day', 'hour', 'minute', 'second', 'week', 'month', 'year'.
   *
   * @param {string} interval
   * returns {Duration}
   */
  static parseIntervalToDuration(interval) {
    const regex = /^([+-]?\d+)\s*(second|minute|hour|day|week|month|year)s?$/i;
    const match = interval.trim().match(regex);
    if (!match) throw new Error("Invalid interval format");
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    return { [unit]: value };
  }

  /**
   * Checks if the current time exceeds a given timestamp, optionally offset by a time interval.
   *
   * @param {string} timestamp - The timestamp string to check.
   * @param {string} [interval] - Optional interval (e.g., '+1 day', '-2 hours').
   * @returns {boolean}
   */
  static hasExceededTimestamp(timestamp, interval = "") {
    const format = this.identifyDateFormatFromString(timestamp);
    if (!format) return false;

    const localTimestamp = LuxonDateTime.fromFormat(
      timestamp,
      this.phpToLuxonFormat(format),
      {
        zone: "local",
      }
    );

    let specifiedTime = localTimestamp.setZone("Asia/Hong_Kong");
    if (!specifiedTime.isValid) return false;

    if (interval && typeof interval === "string") {
      try {
        specifiedTime = specifiedTime.plus(
          this.parseIntervalToDuration(interval)
        );
      } catch (e) {
        return false;
      }
    }

    const now = LuxonDateTime.now().setZone("Asia/Hong_Kong");
    return now > specifiedTime;
  }

  /**
   * Convert PHP date format to Luxon-compatible format.
   *
   * @param {string} format - PHP-style format.
   * @returns {string}
   */
  static phpToLuxonFormat(format) {
    return format
      .replace("Y", "yyyy")
      .replace("m", "MM")
      .replace("d", "dd")
      .replace("H", "HH")
      .replace("i", "mm")
      .replace("s", "ss");
  }

  /**
   * Parses a date string into a Unix timestamp (in seconds).
   *
   * @param {string} dateStr - The date string to parse.
   * @param {string|null} timeZone - Optional IANA timezone name.
   * @returns {number|false} - Unix timestamp or false on failure.
   */
  static parseDateToTimestamp(dateStr, timeZone = null) {
    const format = this.identifyDateFormatFromString(dateStr);
    if (!format) {
      console.error("BAD FORMAT", dateStr);
      return false;
    }

    const dt = LuxonDateTime.fromFormat(
      dateStr,
      this.phpToLuxonFormat(format),
      {
        zone: timeZone || "Asia/Hong_Kong",
      }
    );

    if (!dt.isValid) {
      console.error(
        "Invalid date:[",
        dateStr,
        "] Format:[",
        format,
        "] Timezone:[",
        timeZone,
        "]"
      );
    } else {
      // console.warn("Valid date:", dateStr, "Format:", format, timeZone);
    }

    return dt.isValid ? Math.floor(dt.toSeconds()) : false;
  }

  /**
   * Calculates the difference in seconds between two dates.
   *
   * @param {string} startDate - Start date string.
   * @param {string} endDate - End date string.
   * @returns {number|false} Seconds difference, or false if input invalid.
   */
  static diffInSeconds(startDate, endDate) {
    const start = this.parseDateToTimestamp(startDate);
    const end = this.parseDateToTimestamp(endDate);

    if (start === false || end === false) return false;

    return end - start;
  }

  /**
   * Returns the time difference between two dates in human-readable format.
   *
   * @param {string} startDate - Start date string.
   * @param {string} endDate - End date string.
   * @returns {string|false} - e.g., "2 days, 3 hours", or false if invalid.
   */
  static diffInHumanReadable(startDate, endDate) {
    const start = this.parseDateToTimestamp(startDate);
    const end = this.parseDateToTimestamp(endDate);

    if (start === false || end === false) return false;

    let diff = Math.abs(end - start);

    const units = [
      { name: "year", seconds: 31536000 },
      { name: "month", seconds: 2592000 },
      { name: "day", seconds: 86400 },
      { name: "hour", seconds: 3600 },
      { name: "minute", seconds: 60 },
      { name: "second", seconds: 1 },
    ];

    const result = [];

    for (const unit of units) {
      if (diff >= unit.seconds) {
        const value = Math.floor(diff / unit.seconds);
        result.push(`${value} ${unit.name}${value !== 1 ? "s" : ""}`);
        diff -= value * unit.seconds;
      }

      if (result.length >= 2) break; // Only show top 2 units
    }

    return result.join(", ");
  }

  /**
   * Validates whether a date string matches a specific format exactly.
   *
   * @param {string} dateStr - The date string to validate.
   * @param {string} [format='yyyy-MM-dd'] - The expected format.
   * @returns {boolean}
   */
  static isValidDate(dateStr, format = "yyyy-MM-dd") {
    const dt = LuxonDateTime.fromFormat(dateStr, format);
    return dt.isValid && dt.toFormat(format) === dateStr;
  }

  /**
   * Converts a date from one format to another.
   *
   * @param {string} dateStr - The input date string.
   * @param {string} [outputFormat='dd/MM/yyyy'] - The desired output format.
   * @param {string|null} inputFormat - Optional input format to use.
   * @returns {string|false} - Formatted date string or false if invalid.
   */
  static formatDate(dateStr, outputFormat = "dd/MM/yyyy", inputFormat = null) {
    if (!inputFormat) {
      const detected = this.identifyDateFormatFromString(dateStr);
      if (!detected) return false;
      inputFormat = this.phpToLuxonFormat(detected);
    }

    const dt = LuxonDateTime.fromFormat(dateStr, inputFormat);
    return dt.isValid ? dt.toFormat(outputFormat) : false;
  }

  /**
   * Returns the start of the day (00:00:00) for a given date.
   *
   * @param {string} dateStr - The input date string.
   * @param {string|null} timeZone - Optional IANA timezone name.
   * @returns {string|false} - Formatted datetime string or false if invalid.
   */
  static getStartOfDay(dateStr, timeZone = null) {
    const timestamp = this.parseDateToTimestamp(dateStr, timeZone);
    if (timestamp === false) return false;

    const dt = LuxonDateTime.fromSeconds(timestamp)
      .setZone(timeZone || "Asia/Hong_Kong")
      .startOf("day");

    return dt.toFormat("yyyy-MM-dd HH:mm:ss");
  }

  /**
   * Returns the end of the day (23:59:59) for a given date.
   *
   * @param {string} dateStr - The input date string.
   * @param {string|null} timeZone - Optional IANA timezone name.
   * @returns {string|false} - Formatted datetime string or false if invalid.
   */
  static getEndOfDay(dateStr, timeZone = null) {
    const timestamp = this.parseDateToTimestamp(dateStr, timeZone);
    if (timestamp === false) return false;

    const dt = LuxonDateTime.fromSeconds(timestamp)
      .setZone(timeZone || "Asia/Hong_Kong")
      .endOf("day");

    return dt.toFormat("yyyy-MM-dd HH:mm:ss");
  }

  /**
   * Adds a number of days to a date and returns the new LuxonDateTime.
   *
   * @param {string} dateStr - The input date string.
   * @param {number} days - Number of days to add (can be negative).
   * @param {string|null} timeZone - Optional timezone.
   * @returns {string|false} - New datetime string or false on failure.
   */
  static addDays(dateStr, days, timeZone = null) {
    try {
      const zone = timeZone || "Asia/Hong_Kong";
      const format = this.identifyDateFormatFromString(dateStr);
      if (!format) return false;

      const dt = LuxonDateTime.fromFormat(
        dateStr,
        this.phpToLuxonFormat(format),
        {
          zone,
        }
      );
      if (!dt.isValid) return false;

      const result = dt.plus({ days: Number(days) });
      return result.toFormat("yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      return false;
    }
  }

  /**
   * Returns the next occurrence of a weekday at a specified time.
   *
   * @param {string} weekday - e.g., 'Monday', 'Friday'
   * @param {string} [time='00:00:00'] - Time in HH:mm:ss format.
   * @param {string|null} timeZone - Optional timezone.
   * @returns {string|false} - Formatted datetime or false on error.
   */
  static getNextOccurrence(weekday, time = "00:00:00", timeZone = null) {
    try {
      const validWeekdays = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ];

      if (!validWeekdays.includes(weekday.toLowerCase())) {
        throw new Error(`Invalid weekday: "${weekday}"`);
      }

      const zone = timeZone || "Asia/Hong_Kong";
      const [hour, minute, second] = time
        .split(":")
        .map((n) => parseInt(n, 10));
      let dt = LuxonDateTime.now().setZone(zone).startOf("day");

      // Luxon understands "next Monday", etc.

      if (dt.weekdayLong === null) {
        throw new Error("Invalid weekday in LuxonDateTime");
      }

      while (dt.weekdayLong.toLowerCase() !== weekday.toLowerCase()) {
        dt = dt.plus({ days: 1 });
      }

      dt = dt.set({ hour, minute, second });
      return dt.toFormat("yyyy-MM-dd HH:mm:ss");
    } catch (e) {
      return false;
    }
  }

  /**
   * Converts a date from one timezone to another.
   *
   * @param {string} dateStr - The input date string.
   * @param {string} fromZone - Original timezone.
   * @param {string} toZone - Target timezone.
   * @param {string} [format='yyyy-MM-dd HH:mm:ss'] - Desired output format.
   * @returns {string|false}
   */
  static convertTimezone(
    dateStr,
    fromZone,
    toZone,
    format = "yyyy-MM-dd HH:mm:ss"
  ) {
    try {
      const inputFormat = this.phpToLuxonFormat(
        // @ts-ignore
        this.identifyDateFormatFromString(dateStr)
      );
      if (!inputFormat) return false;

      const dt = LuxonDateTime.fromFormat(dateStr, inputFormat, {
        zone: fromZone,
      });
      if (!dt.isValid) return false;

      return dt.setZone(toZone).toFormat(format);
    } catch (e) {
      return false;
    }
  }

  /**
   * Determines if the given date is in the past.
   *
   * @param {string} dateStr - Date string to evaluate.
   * @returns {boolean|false} - True if in the past, false if not or invalid.
   */
  static isPast(dateStr) {
    const timestamp = this.parseDateToTimestamp(dateStr);
    if (timestamp === false) return false;

    return timestamp < Math.floor(Date.now() / 1000);
  }

  /**
   * Determines if the given date is in the future.
   *
   * @param {string} dateStr - Date string to evaluate.
   * @returns {boolean|false} - True if in the future, false if not or invalid.
   */
  static isFuture(dateStr) {
    const timestamp = this.parseDateToTimestamp(dateStr);
    if (timestamp === false) return false;

    return timestamp > Math.floor(Date.now() / 1000);
  }

  /**
   * Checks if a date is between two other dates.
   *
   * @param {string} dateStr - The date to check.
   * @param {string} startDateStr - Start boundary date.
   * @param {string} endDateStr - End boundary date.
   * @returns {boolean|false} - True if within range, false if invalid.
   */
  static isBetween(dateStr, startDateStr, endDateStr) {
    const dateTs = this.parseDateToTimestamp(dateStr);
    const startTs = this.parseDateToTimestamp(startDateStr);
    const endTs = this.parseDateToTimestamp(endDateStr);

    if (dateTs === false || startTs === false || endTs === false) return false;

    return dateTs >= startTs && dateTs <= endTs;
  }

  /**
   * Checks if a format is valid.
   *
   * @param {string} format - The format to check.
   */

  static isValidFormat(format) {
    try {
      const dt = LuxonDateTime.now();
      const formatted = dt.toFormat(format);
      const parsed = LuxonDateTime.fromFormat(formatted, format);
      return parsed.isValid;
    } catch (e) {
      return false;
    }
  }

  /**
   * Returns the current time formatted, with optional timezone.
   *
   * @param {string} [format='yyyy-MM-dd HH:mm:ss'] - Output format.
   * @param {string|null} [timeZone=null] - IANA timezone name.
   * @returns {string} - Current formatted LuxonDateTime.
   */
  static now(format = "yyyy-MM-dd HH:mm:ss", timeZone = null) {
    const valid = this.isValidFormat(format);
    try {
      if (!valid) {
        return LuxonDateTime.now()
          .setZone(timeZone || "Asia/Hong_Kong")
          .toFormat("yyyy-MM-dd HH:mm:ss");
      }
      return LuxonDateTime.now()
        .setZone(timeZone || "Asia/Hong_Kong")
        .toFormat(format);
    } catch (e) {
      throw new Error("Invalid format");
      // return false;
    }
  }

  /**
   * Converts a time string (HH:mm or HH:mm:ss) to total minutes.
   *
   * @param {string} timeStr - Time string to convert.
   * @returns {number} - Total minutes.
   * @throws {Error} - If the input format is invalid.
   */
  static timeToMinutes(timeStr) {
    const parts = timeStr.split(":");

    if (parts.length < 2) {
      throw new Error("Invalid time string format");
    }

    const hours = Math.abs(parseInt(parts[0], 10));
    const minutes = Math.abs(parseInt(parts[1], 10));

    return hours * 60 + minutes;
  }

  /**
   * Converts a Unix timestamp into a relative time string.
   *
   * @param {number} timestamp - Unix timestamp (in seconds).
   * @returns {string|false} - Relative string or false if invalid.
   */
  static getRelativeTime(timestamp) {
    if (typeof timestamp !== "number" || isNaN(timestamp)) {
      return false;
    }

    const current = Math.floor(Date.now() / 1000);
    const diff = current - timestamp;

    if (diff < 60) return "just now";

    const thresholds = {
      "1y": 31536000,
      "1m": 2592000,
      "2w": 1209600,
      "1w": 604800,
      "1d": 86400,
      "1h": 3600,
    };

    for (const [label, seconds] of Object.entries(thresholds)) {
      if (diff >= seconds) {
        return `${Math.floor(diff / seconds)}${label[label.length - 1]}`;
      }
    }

    return "just now";
  }

  /**
   * Returns a user-friendly relative time string like '2 minutes ago'.
   *
   * @param {number} timestamp - Unix timestamp in seconds.
   * @returns {string|false}
   */
  static formatPrettyRelativeTime(timestamp) {
    if (typeof timestamp !== "number" || isNaN(timestamp)) return false;

    const now = Math.floor(Date.now() / 1000);
    let diff = now - timestamp;

    if (diff < 60) return "just now";

    const units = [
      { name: "year", seconds: 31536000 },
      { name: "month", seconds: 2592000 },
      { name: "week", seconds: 604800 },
      { name: "day", seconds: 86400 },
      { name: "hour", seconds: 3600 },
      { name: "minute", seconds: 60 },
    ];

    for (const unit of units) {
      if (diff >= unit.seconds) {
        const count = Math.floor(diff / unit.seconds);
        return `${count} ${unit.name}${count !== 1 ? "s" : ""} ago`;
      }
    }

    return "just now";
  }
}
