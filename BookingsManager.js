import pkg from "rrule";
import DateTime from "./DateTime.js";
const { RRule } = pkg;
// import RedisWrapper from "./ReddisWrapper.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ScyllaDb from "./scylla/ScyllaDb.js";

const shouldReset = false;
async function resetDB() {
  const tables = await ScyllaDb.listTables();

  for (const table of tables) {
    if (
      table === "fs_bookings" ||
      table === "fs_booking_settings" ||
      table === "pupils"
    ) {
      console.log(`Deleting table: ${table}`);
      try {
        await ScyllaDb.deleteTable(table);
      } catch (err) {
        console.error(`Failed to delete table ${table}:`, err.message);
      }
    }
  }
}

function validateUtf8Strings(obj, path = "") {
  for (const key in obj) {
    const value = obj[key];
    const currentPath = `${path}.${key}`;

    if (typeof value === "string") {
      const buffer = Buffer.from(value, "utf8");
      const reencoded = buffer.toString("utf8");
      if (value !== reencoded) {
        console.warn(`⚠️ Non-UTF8 or invalid string at ${currentPath}:`, value);
      }
    } else if (typeof value === "object" && value !== null) {
      validateUtf8Strings(value, currentPath);
    }
  }
}

async function init() {
  try {
    const tableConfigsPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "scylla",
      "config",
      "tables.json"
    );
    const tableConfigs = JSON.parse(
      await fs.readFile(tableConfigsPath, "utf8")
    );
    console.log("✅ Table configurations loaded:", Object.keys(tableConfigs));

    // ScyllaDb.configure({
    //   endpoint:
    //     "https://i7wrvsvkgmteuu4co2sd3r5tle0cxpwf.lambda-url.ap-northeast-1.on.aws/scylla",
    //   region: "ap-northeast-1",
    //   port: 443,
    //   key: "test",
    //   secret: "test",
    //   enableCache: false,
    // });
    //

    ScyllaDb.configure({
      endpoint: process.env.SCYLLA_ENDPOINT || "http://localhost:8000/",
      port: process.env.SCYLLA_PORT || 8000,
      region: process.env.SCYLLA_REGION || "us-east-1",
      key: process.env.SCYLLA_KEY || "test",
      secret: process.env.SCYLLA_SECRET || "test",
      enableCache: true, // Enable cache
    });
    ScyllaDb.beginSession();

    console.log("✅ ScyllaDB client configured with cache enabled");

    await ScyllaDb.loadTableConfigs(tableConfigsPath);
    console.log("✅ Table configs loaded into ScyllaDb");

    console.log("list of tables:", await ScyllaDb.listTables());

    //TODO: remove when not needed
    if (shouldReset) {
      await resetDB();
    }
    const schemaTablesNames = await ScyllaDb.listTables();
    for (const tableName of Object.keys(tableConfigs)) {
      console.log(`Table: ${tableName}`);
      if (!schemaTablesNames.find((name) => tableName === name)) {
        console.log(
          `Table ${tableName} does not exist in ScyllaDB, creating...`
        );
        const schema = ScyllaDb.getSchemaFromConfig(tableName);
        schema.TableName = tableName;
        console.log("validating schema....");
        validateUtf8Strings(schema); // will log bad values
        await ScyllaDb.createTable(schema);
      } else {
        console.log(
          "got table, decription:",
          await ScyllaDb.describeTable(tableName)
        );
      }
    }
  } catch (e) {
    console.error("Error during initialization:", e);
  }
  console.log("now has tables:", await ScyllaDb.listTables());
}
await init();

export default class BookingsManager {
  static notifyConditions = {
    request_reschedule: ["fan", "creator"],
    approve_reschedule: ["fan", "creator"],
    success_reschedule: ["both"],
    decline_reschedule: ["fan", "creator"],
    success_booking: ["both"],
    cancel_booking: ["both"],
    booking_reminder: ["both"],
    session_start: ["both"],
  };
  static userIdFromBooking = {};
  static subjects = {
    request_reschedule: {
      fan: "Reschedule Request Received",
      creator: "New Reschedule Request",
    },
    approve_reschedule: {
      fan: "Reschedule Approved",
      creator: "Reschedule Approved",
    },
    success_reschedule: {
      fan: "Reschedule Successful",
      creator: "Reschedule Successful",
    },
    decline_reschedule: {
      fan: "Reschedule Request Declined",
      creator: "Reschedule Declined",
    },
    success_booking: {
      fan: "Booking Confirmed",
      creator: "New Booking Confirmed",
    },
    cancel_booking: {
      fan: "Booking Canceled",
      creator: "Booking Canceled",
    },
    booking_reminder: {
      fan: "Upcoming Session Reminder",
      creator: "Upcoming Session Reminder",
    },
    session_start: {
      fan: "Your Session Has Started",
      creator: "Your Session Has Started",
    },
  };
  static userExistenceStatus = {};
  static globalBookingSettings = {};

  constructor() {
    this.db = ScyllaDb;
    this.dateTime = new DateTime();
    // this.redis = RedisWrapper;
  }

  static getRollingWorkWindows(bookingSettings) {
    return [
      { start: "00:00", end: "03:00" },
      { start: "08:00", end: "00:00" },
    ];
  }

  static resolveEffectiveHours(bookingSettings) {
    const workingHours = [];

    const times = [
      {
        start: bookingSettings.after_hours.start,
        end: bookingSettings.after_hours.end,
      },
      {
        start: bookingSettings.default_working_hours.start,
        end: bookingSettings.default_working_hours.end,
      },
    ];

    for (const time of times) {
      const startDate = new Date(`1970-01-01 ${time.start}`);
      const endDate = new Date(`1970-01-01 ${time.end}`);

      let endTime = time.end;
      //removed for clarity
      // if (time.end === "00:20") {
      //   endTime = "00:00";
      // }

      if (endDate < startDate) {
        workingHours.push({
          start: time.start,
          end: "23:59:59",
        });
        workingHours.push({
          start: "00:00:00",
          // end: "03:00",
          end: time.end, //removed for clarity
        });
      } else {
        workingHours.push({
          start: time.start,
          end: endTime,
        });
      }
    }

    workingHours.sort((a, b) => {
      const aStart = new Date(`1970-01-01 ${a.start}`).getTime();
      const bStart = new Date(`1970-01-01 ${b.start}`).getTime();
      return aStart - bStart;
    });

    const finalHours = [];
    let currentInterval = workingHours[0];

    for (let i = 1; i < workingHours.length; i++) {
      const nextInterval = workingHours[i];
      const currentEnd = new Date(
        `1970-01-01 ${currentInterval.end}`
      ).getTime();
      const nextStart = new Date(`1970-01-01 ${nextInterval.start}`).getTime();

      if (currentEnd >= nextStart) {
        const nextEnd = new Date(`1970-01-01 ${nextInterval.end}`).getTime();
        const newEndTime = new Date(Math.max(currentEnd, nextEnd));
        currentInterval.end = `${String(newEndTime.getHours()).padStart(
          2,
          "0"
        )}:${String(newEndTime.getMinutes()).padStart(2, "0")}`;
      } else {
        finalHours.push(currentInterval);
        currentInterval = nextInterval;
      }
    }

    finalHours.push(currentInterval);

    return finalHours;
  }

  static async isUserExistsAndValid(userId) {
    userId = parseInt(userId);

    if (this.userExistenceStatus[userId] !== undefined) {
      return this.userExistenceStatus[userId];
    }

    let user;
    try {
      user = await ScyllaDb.getItem("fs_booking_settings", {
        id: String(userId),
      });
    } catch (e) {
      console.error("Error checking user existence:", e);
      return {
        error: "database_error",
        message: `Database error occurred while checking user existence for user ID: ${userId}`,
      };
    }

    if (!user || user.activity_status !== "active") {
      const error = {
        error: "user_not_active",
        message:
          "User is either inactive or not found in the role-specific table.",
      };
      this.userExistenceStatus[userId] = error;
      return error;
    }

    this.userExistenceStatus[userId] = true;
    return true;
  }

  static async getCreatorBookingSettings(creatorId) {
    // Return false if creator ID is empty
    if (!creatorId) {
      return false;
    }
    // Convert creator ID to integer (if applicable)
    creatorId = parseInt(creatorId, 10);

    // Return cached settings if already present
    // if (this.globalBookingSettings[creatorId]) {
    //   return this.globalBookingSettings[creatorId];
    // }

    // Retrieve booking settings from user fields
    let userSettings;
    try {
      userSettings = await ScyllaDb.getItem("fs_booking_settings", {
        id: String(creatorId),
      });
    } catch (e) {
      console.error("Error retrieving user fields:", e);
      return {
        error: "database_error",
        message: `Database error occurred while retrieving booking settings for creator ID: ${creatorId}`,
      };
    }

    // Return an error if not found
    if (!userSettings) {
      return {
        error: "booking_setting_not_found",
        message: `Booking settings not found for creator ID: ${creatorId}`,
      };
    }

    // Cache and return the result
    this.globalBookingSettings[creatorId] = userSettings;
    return userSettings;
  }

  static async isCreatorBookingSuspended(creatorId, date, bookingSettings) {
    // Validate input (already assumed validated per original comments)
    let setCreatorTimeZone;
    try {
      setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
    } catch (e) {
      console.error("Error setting creator timezone:", e);
      return {
        error: "timezone_error",
        message: `Error setting timezone for creator ID: ${creatorId}`,
      };
    }

    if (!setCreatorTimeZone || setCreatorTimeZone.error) {
      return {
        error: "no_timezone_found",
        message: `No timezone found for creator ID: ${creatorId}`,
      };
    }

    const suspensions = bookingSettings?.suspensions ?? [];

    if (suspensions.length === 0) {
      return "not_suspended";
    }

    const checkDate = new Date(date).getTime();

    for (const suspension of suspensions) {
      if (suspension.status === "active") {
        const suspensionStart = new Date(suspension.start_date).getTime();
        const suspensionEnd = new Date(suspension.end_date).getTime();

        if (checkDate >= suspensionStart && checkDate <= suspensionEnd) {
          return {
            error: "suspensions_found",
            message: `Suspensions found for creator ID: ${creatorId}. Please try another date.`,
          };
        }
      }
    }

    return "not_suspended";
  }

  static async validateBookingDuration(
    creatorId,
    bookingStart,
    bookingEnd,
    bookingSettings
  ) {
    // Set creator timezone (mocked)
    let setCreatorTimeZone;
    try {
      setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
    } catch (e) {
      console.error("Error setting creator timezone:", e);
      return {
        error: "timezone_error",
        message: `Error setting timezone for creator ID: ${creatorId}`,
      };
    }

    if (!setCreatorTimeZone) {
      return false;
    }

    // console.log(`Booking Start: ${bookingStart}, Booking End: ${bookingEnd}`);

    // Convert to timestamps
    let bookingStartTime = new Date(bookingStart).getTime();
    let bookingEndTime = new Date(bookingEnd).getTime();

    // Handle overnight bookings
    if (bookingEndTime <= bookingStartTime) {
      bookingEndTime += 24 * 60 * 60 * 1000; // add 1 day in ms
    }

    const calculatedDuration = (bookingEndTime - bookingStartTime) / 60000; // ms to minutes

    // console.log(`Calculated Duration (minutes): ${calculatedDuration}`);

    const minBookingTime = parseInt(bookingSettings.min_booking_time || 0);
    const maxBookingTime = parseInt(bookingSettings.max_booking_time || 0);

    // console.log( `Min Booking Time: ${minBookingTime}, Max Booking Time: ${maxBookingTime}`);

    if (!minBookingTime || !maxBookingTime) {
      return false;
    }

    if (calculatedDuration === 0) {
      console.log(
        `Error: The calculated booking duration is zero minutes, which is not within the allowed range of ${minBookingTime} to ${maxBookingTime} minutes.`
      );
      return {
        error: "invalid_booking_duration",
        message:
          "The booking duration is zero minutes, which does not fall within the allowed minimum and maximum time limits set by the creator.",
      };
    }

    if (
      calculatedDuration < minBookingTime ||
      calculatedDuration > maxBookingTime
    ) {
      console.log(
        `Error: Calculated duration of ${calculatedDuration} minutes does not fall within the allowed range (${minBookingTime} - ${maxBookingTime} minutes).`
      );
      return {
        error: "invalid_booking_duration",
        message:
          "The booking duration does not fall within the allowed minimum and maximum time limits set by the creator.",
      };
    }

    // console.log("Success: Booking duration is valid.");
    return true;
  }

  static getOfflineHours(bookingSettings) {
    const workingHoursEnd = bookingSettings.default_working_hours.end;
    const workingHoursStart = bookingSettings.default_working_hours.start;
    const afterHoursStart = bookingSettings.after_hours.start;
    const afterHoursEnd = bookingSettings.after_hours.end;

    const offlineHours = [];

    // Offline period 1: from end of working hours to start of after-hours
    offlineHours.push({
      offline_start: workingHoursEnd,
      offline_end: afterHoursStart,
    });

    // Offline period 2: from end of after-hours to start of next working hours
    offlineHours.push({
      offline_start: afterHoursEnd,
      offline_end: workingHoursStart,
    });

    return offlineHours;
  }

  static async isBookingWithinOfflineHours(
    creatorId,
    bookingStartTime,
    bookingEndTime,
    date,
    bookingSettings
  ) {
    let setCreatorTimeZone;
    try {
      setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
    } catch (e) {
      console.error("Error setting creator timezone:", e);
      return {
        error: "timezone_error",
        message: `Error setting timezone for creator ID: ${creatorId}`,
      };
    }

    if (!setCreatorTimeZone) {
      return false;
    }

    const offlineHours = this.getOfflineHours(bookingSettings);

    const bookingStartTimestamp = DateTime.parseDateToTimestamp(
      `${date} ${bookingStartTime}`
    );
    let bookingEndTimestamp = DateTime.parseDateToTimestamp(
      `${date} ${bookingEndTime}`
    );

    for (const period of offlineHours) {
      const offlineStartTimestamp = DateTime.parseDateToTimestamp(
        `${date} ${period.offline_start}`
      );
      let offlineEndTimestamp = DateTime.parseDateToTimestamp(
        `${date} ${period.offline_end}`
      );

      // Handle if the offline period crosses midnight
      if (offlineEndTimestamp < offlineStartTimestamp) {
        offlineEndTimestamp = new Date(
          offlineEndTimestamp + 24 * 60 * 60 * 1000
        ).getTime(); // add 1 day
      }

      const isStartWithinOffline =
        bookingStartTimestamp > offlineStartTimestamp &&
        bookingStartTimestamp < offlineEndTimestamp;

      const isEndWithinOffline =
        bookingEndTimestamp > offlineStartTimestamp &&
        bookingEndTimestamp < offlineEndTimestamp;

      if (isStartWithinOffline || isEndWithinOffline) {
        return {
          error: "booking_within_offline_hours",
          message: "The booking falls within offline hours.",
        };
      }
    }

    return true;
  }

  // its  201 but it says like this
  // {
  //     "error": "missing_required_fields",
  //     "message": "One or more required fields are missing."
  // }
  static async createBooking(
    fanId,
    creatorId,
    bookingDate,
    bookingStart,
    bookingEnd,
    baseCharge,
    negotiationPhase = false,
    initialTokenCharge = [],
    recurrenceRule = null
  ) {
    console.log(
      "🚀 ~ BookingsManager ~ createBooking ~ initialTokenCharge:",
      initialTokenCharge
    );
    // Basic validation
    if (!fanId || !creatorId || !bookingDate || !bookingStart || !bookingEnd) {
      return {
        error: "missing_required_fields",
        message: "One or more required fields are missing.",
      };
    }

    // Sanitize/normalize inputs
    fanId = String(fanId);
    creatorId = String(creatorId);
    bookingDate = sanitizeTextField(bookingDate);
    bookingStart = sanitizeTextField(bookingStart);
    bookingEnd = sanitizeTextField(bookingEnd);
    baseCharge = parseFloat(baseCharge);
    negotiationPhase = Boolean(negotiationPhase);
    initialTokenCharge = Array.isArray(initialTokenCharge)
      ? initialTokenCharge
      : [];
    recurrenceRule = recurrenceRule ? sanitizeTextField(recurrenceRule) : null;

    try {
      const userTokens = Tokens.getUserTokensBalance(fanId);

      if (userTokens <= 0) {
        return {
          error: "insufficient_token",
          message: "You do not have enough tokens to create the booking.",
        };
      }

      const fanExists = await this.isUserExistsAndValid(fanId, "fan");
      const creatorExists = await this.isUserExistsAndValid(
        creatorId,
        "creator"
      );

      if (fanExists?.error) {
        return fanExists;
      }
      if (creatorExists?.error) {
        return creatorExists;
      }

      const bookingSettings = await this.getCreatorBookingSettings(creatorId);

      if (bookingSettings?.error) {
        return bookingSettings; // Return error if settings not found
      }

      if (!bookingSettings) {
        return {
          error: "missing_booking_settings",
          message: "No booking settings found for creator ID: " + creatorId,
        };
      }

      const setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);

      if (!setCreatorTimeZone || setCreatorTimeZone.error) {
        return {
          error: "timezone_error",
          message: "Time zone could not be set for creator ID: " + creatorId,
        };
      }

      const isCreatorBookingSuspended = await this.isCreatorBookingSuspended(
        creatorId,
        bookingDate,
        bookingSettings
      );

      if (isCreatorBookingSuspended?.error) {
        console.log("is_creator_booking_suspended false");
        return isCreatorBookingSuspended;
      }

      const isBookingDurationValid = await this.validateBookingDuration(
        creatorId,
        bookingStart,
        bookingEnd,
        bookingSettings
      );

      if (!isBookingDurationValid || isBookingDurationValid.error) {
        console.log("isBookingDurationValid error or false");
        return isBookingDurationValid;
      }

      const isWithinOffline = await this.isBookingWithinOfflineHours(
        creatorId,
        bookingStart,
        bookingEnd,
        bookingDate,
        bookingSettings
      );

      // Return error if booking falls within offline hours
      if (isWithinOffline?.error) {
        console.log("is_within_offline");
        return isWithinOffline;
      }

      // Validate server availability.
      // $is_available_time_slot = self::check_availability_based_on_json( $creator_id, $booking_date, $booking_start, $booking_end, $booking_settings );

      // creatorId = 373;
      const requestedStart = `${bookingDate} ${bookingStart}`;
      const requestedEnd = `${bookingDate} ${bookingEnd}`;

      const isAvailableTimeSlot = await this.isRequestedTimeAvailable(
        creatorId,
        requestedStart,
        requestedEnd
      );

      if (!isAvailableTimeSlot) {
        console.log(
          "Error: The requested booking time is not available for the specified date and time."
        );
        console.log(
          `Fan ID: ${fanId}, Creator ID: ${creatorId}, Date: ${bookingDate}, Start: ${bookingStart}, End: ${bookingEnd}`
        );
        return {
          error: "unavailable_time_slot",
          message:
            "The requested time slot is not available for the selected creator.",
        };
      }

      console.log(
        "Debug: Requested booking time is available. Proceeding with booking creation."
      );
      console.log(
        `Fan ID: ${fanId}, Creator ID: ${creatorId}, Date: ${bookingDate}, Start: ${bookingStart}, End: ${bookingEnd}`
      );

      // return;

      // If the availability check returns an error, return it.
      if (isAvailableTimeSlot?.error) {
        console.log("is_available_time_slot");
        return isAvailableTimeSlot;
      }

      // Return error if the requested time slot is not available.
      if (!isAvailableTimeSlot) {
        return {
          error: "unavailable_time_slot",
          message: `The requested time slot is not available for creator ID: ${creatorId}`,
        };
      }

      // Check if the required token price fields exist in the booking settings and return error if either of the required fields is not set.
      if (
        !bookingSettings.default_working_hour_token_price_per_minute ||
        !bookingSettings.after_hour_token_price_per_minute
      ) {
        console.log("default_working_hour_token_price_per_minute empty check");
        return {
          error: "missing_token_price_fields",
          message: `Token price fields are missing in the booking settings for creator ID: ${creatorId}`,
        };
      }

      // Define and sanitize token prices.
      const defaultTokenPerMinute = parseInt(
        bookingSettings.default_working_hour_token_price_per_minute,
        10
      );

      const surchargeTokenPerMinute = parseInt(
        bookingSettings.after_hour_token_price_per_minute,
        10
      );

      //
      //
      const priceBreakdown = await this.calculatePrice(
        creatorId,
        bookingStart,
        bookingEnd,
        bookingDate,
        defaultTokenPerMinute,
        surchargeTokenPerMinute,
        bookingSettings
      );

      // Return error if price breakdown is invalid or total price is zero or less.
      if (
        !priceBreakdown ||
        typeof priceBreakdown !== "object" ||
        Object.keys(priceBreakdown).length === 0 ||
        priceBreakdown.total_price <= 0
      ) {
        console.log("price_breakdown:", priceBreakdown);
        return {
          error: "invalid_price_breakdown",
          message: `Invalid price breakdown for creator ID: ${creatorId}`,
        };
      }

      // Check if the user's available tokens are less than the required total.
      if (userTokens < priceBreakdown.total_price) {
        return {
          error: "insufficient_token",
          message: "You do not have enough tokens to complete the booking.",
        };
      }

      // Generate a unique booking ID as a numeric string (e.g., timestamp as string)
      const bookingId = Date.now().toString(); // e.g., "1688123456789"

      // Prepare the item to insert
      const bookingItem = {
        user_ID: fanId.toString(), // PK as string numeric ID
        booking_ID: bookingId, // SK as string numeric ID
        creatorId: creatorId.toString(), // GSI1 PK as string numeric ID
        startTime: `${bookingDate} ${bookingStart}`, // GSI1 SK as datetime string
        endTime: `${bookingDate} ${bookingEnd}`,
        timezone: bookingSettings.timezone,
        status: negotiationPhase ? "negotiation" : "pending",
        negotiationPhase: negotiationPhase ? 1 : 0,
        surchargeFee: priceBreakdown.surcharge_price,
        defaultFee: priceBreakdown.regular_price,
        createdAt: new Date().toISOString(),
      };

      // Add optional field: initial_token_charge
      if (initialTokenCharge && Object.keys(initialTokenCharge).length > 0) {
        bookingItem.initialTokenCharge = initialTokenCharge;
      }

      if (recurrenceRule) {
        bookingItem.recurrenceRule = recurrenceRule;
      }

      // Insert into ScyllaDB
      const insertResult = await ScyllaDb.putItem("fs_bookings", bookingItem);

      // Return booking ID if successful
      if (insertResult) {
        return bookingId;
      }

      // If failed
      return {
        error: "booking_insertion_failed",
        message: `Failed to insert booking for fan ID: ${fanId} and creator ID: ${creatorId}`,
      };
    } catch (e) {
      console.error(e);
      return {
        error: "internal_error",
        message: "An internal error occurred while creating the booking.",
      };
    }
  }

  static async calculatePrice(
    creatorId,
    appointmentStart,
    appointmentEnd,
    date,
    defaultTokenPerMinute,
    surchargeTokenPerMinute,
    bookingSettings
  ) {
    // Set the time zone for the creator
    let setCreatorTimeZone;
    try {
      setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
    } catch (e) {
      console.error(e);
      return {
        error: "timezone_error",
        message: `Error setting timezone for creator ID: ${creatorId}`,
      };
    }

    if (!setCreatorTimeZone) {
      return {
        error: "timezone_error",
        message: `Time zone could not be set for creator ID: ${creatorId}`,
      };
    }

    // Get the cross-over data
    let crossoverData;
    try {
      crossoverData = await this.doesAppointmentCrossOver(
        creatorId,
        appointmentStart,
        appointmentEnd,
        date,
        bookingSettings
      );
    } catch (e) {
      console.error("Error checking appointment crossover:", e);
      return {
        error: "crossover_error",
        message: `Error checking appointment crossover for creator ID: ${creatorId}`,
      };
    }

    const regularMinutes = crossoverData.minutes_in_default || 0;
    const afterHoursMinutes = crossoverData.minutes_in_after_hours || 0;

    // Calculate prices
    const regularPrice = regularMinutes * defaultTokenPerMinute;
    const surchargePrice = afterHoursMinutes * surchargeTokenPerMinute;
    const totalPrice = regularPrice + surchargePrice;

    return {
      total_price: totalPrice,
      regular_minutes: regularMinutes,
      after_hours_minutes: afterHoursMinutes,
      regular_price: regularPrice,
      surcharge_price: surchargePrice,
    };
  }

  // Note
  static async doesAppointmentCrossOver(
    creatorId,
    appointmentStart,
    appointmentEnd,
    date,
    bookingSettings
  ) {
    try {
      const setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
      if (!setCreatorTimeZone) return false;
    } catch (e) {
      console.error("Error setting creator timezone:", e);
      return {
        error: "timezone_error",
        message: `Error setting timezone for creator ID: ${creatorId}`,
      };
    }

    const workingHours = bookingSettings.default_working_hours;
    const afterHours = bookingSettings.after_hours;

    let appointmentStartTs = DateTime.parseDateToTimestamp(
      `${date} ${appointmentStart}`
      // setCreatorTimeZone
    );
    let appointmentEndTs = DateTime.parseDateToTimestamp(
      `${date} ${appointmentEnd}`
      // { zone: setCreatorTimeZone, }
    );

    let workingStartTs = DateTime.parseDateToTimestamp(
      `${date} ${workingHours.start}`
      // { zone: setCreatorTimeZone, }
    );
    let workingEndTs = DateTime.parseDateToTimestamp(
      `${date} ${workingHours.end}`
      // { zone: setCreatorTimeZone, }
    );

    let afterStartTs = DateTime.parseDateToTimestamp(
      `${date} ${afterHours.start}`
      // { zone: setCreatorTimeZone, }
    );
    let afterEndTs = DateTime.parseDateToTimestamp(
      `${date} ${afterHours.end}`
      // { zone: setCreatorTimeZone, }
    );

    let minutesInDefault = 0;
    let minutesInAfterHours = 0;

    try {
      const isWithinOffline = await this.isBookingWithinOfflineHours(
        creatorId,
        appointmentStart,
        appointmentEnd,
        date,
        bookingSettings
      );
      if (isWithinOffline?.error) {
        return {
          cross_over: false,
          minutes_in_default: 0,
          minutes_in_after_hours: 0,
        };
      }
    } catch (e) {
      console.error("Error checking booking within offline hours:", e);
      return {
        cross_over: false,
        minutes_in_default: 0,
        minutes_in_after_hours: 0,
      };
    }

    if (workingEndTs < workingStartTs) workingEndTs += 86400;
    if (afterEndTs < afterStartTs) afterEndTs += 86400;
    if (appointmentEndTs < appointmentStartTs) appointmentEndTs += 86400;

    if (
      appointmentStartTs >= workingStartTs &&
      appointmentEndTs <= workingEndTs
    ) {
      minutesInDefault = (appointmentEndTs - appointmentStartTs) / 60;
    } else if (
      appointmentStartTs >= afterStartTs &&
      appointmentEndTs <= afterEndTs
    ) {
      minutesInAfterHours = (appointmentEndTs - appointmentStartTs) / 60;
    } else if (
      appointmentStartTs < workingEndTs &&
      appointmentEndTs > afterStartTs
    ) {
      if (
        appointmentStartTs < workingEndTs &&
        appointmentEndTs < workingEndTs
      ) {
        appointmentStartTs += 86400;
        appointmentEndTs += 86400;
      }
      minutesInDefault = (workingEndTs - appointmentStartTs) / 60;
      minutesInAfterHours = (appointmentEndTs - workingEndTs) / 60;
    } else {
      const appointmentStartTimeOnly = appointmentStart;
      if (
        appointmentStartTimeOnly > workingHours.end &&
        appointmentStartTimeOnly < afterHours.start
      ) {
        minutesInDefault = 0;
        minutesInAfterHours = 0;
      } else {
        let nextAppointmentDate;
        if (
          appointmentStartTimeOnly < workingHours.start &&
          appointmentStartTimeOnly < workingHours.end
        ) {
          nextAppointmentDate = Utilities.get_formatted_current_time(
            "yyyy-MM-dd",
            DateTime.fromISO(
              date
              // { zone: setCreatorTimeZone }
            ).plus({
              days: 1,
            }),
            setCreatorTimeZone
          );
        } else {
          nextAppointmentDate = date;
        }

        appointmentStartTs = DateTime.parseDateToTimestamp(
          `${nextAppointmentDate} ${appointmentStart}`
          // { zone: setCreatorTimeZone, }
        );

        appointmentEndTs = DateTime.parseDateToTimestamp(
          `${nextAppointmentDate} ${appointmentEnd}`
          // { zone: setCreatorTimeZone, }
        );

        if (date !== nextAppointmentDate) {
          minutesInDefault = 0;
          minutesInAfterHours = (appointmentEndTs - appointmentStartTs) / 60;
        } else {
          minutesInDefault = (workingEndTs - appointmentStartTs) / 60;
          minutesInAfterHours = (appointmentEndTs - workingEndTs) / 60;
        }
      }
    }

    return {
      cross_over: minutesInDefault > 0 && minutesInAfterHours > 0,
      minutes_in_default: minutesInDefault,
      minutes_in_after_hours: minutesInAfterHours,
    };
  }

  // not sure if it is working
  static async isRequestedTimeAvailable(
    creatorId,
    requestedStart,
    requestedEnd,
    recurrenceRule = null
  ) {
    try {
      // 1. Handle recurring case
      if (recurrenceRule) {
        const durationMs =
          DateTime.parseDateToTimestamp(requestedEnd) -
          DateTime.parseDateToTimestamp(requestedStart);

        const startTime = requestedStart.slice(11, 16); // "HH:mm"

        // Define a default time window (e.g., 3 months from now)
        const now = new Date();
        const rangeEnd = new Date(
          now.getFullYear(),
          now.getMonth() + 3,
          now.getDate()
        );

        // Generate occurrences
        const rule = RRule.fromString(recurrenceRule);
        const occurrences = rule.between(now, rangeEnd);

        for (const occ of occurrences) {
          const start = new Date(
            `${occ.toISOString().slice(0, 10)}T${startTime}`
          );
          const end = new Date(start.getTime() + durationMs);

          const available = await this.isRequestedTimeAvailable(
            creatorId,
            start.toISOString(),
            end.toISOString()
          );
          if (!available) return false;
        }
      }

      const bookingSettings = await this.getCreatorBookingSettings(creatorId);
      const trueWorkingHours = this.resolveEffectiveHours(bookingSettings);

      const isBookingDurationValid = await this.validateBookingDuration(
        creatorId,
        requestedStart,
        requestedEnd,
        bookingSettings
      );
      if (isBookingDurationValid?.error || !isBookingDurationValid) {
        return false;
      }

      const requestedStartTs = DateTime.parseDateToTimestamp(requestedStart);
      const requestedEndTs = DateTime.parseDateToTimestamp(requestedEnd);

      const isWithinWorkingWindow = (timestamp) => {
        for (const window of trueWorkingHours) {
          const start = DateTime.parseDateToTimestamp(
            `${DateTime.generateRelativeTimestamp(
              "yyyy-MM-dd HH:mm:ss",
              timestamp
            ).slice(0, 10)} ${window.start}`
          );

          const end = DateTime.parseDateToTimestamp(
            `${DateTime.generateRelativeTimestamp(
              "yyyy-MM-dd HH:mm:ss",
              timestamp
            ).slice(0, 10)} ${window.end}`
          );

          if (end < start) {
            end += 24 * 60 * 60 * 1000;
          }

          if (timestamp >= start && timestamp <= end) {
            return true;
          }
        }
        return false;
      };

      for (let ts = requestedStartTs; ts < requestedEndTs; ts += 60 * 1000) {
        if (!isWithinWorkingWindow(ts)) {
          return false;
        }
      }

      const userBookings = await this.getUserBookingJson(
        creatorId,
        bookingSettings,
        true
      );
      const bufferTime = 10 * 60 * 1000;

      for (const day of userBookings.days || []) {
        const bookingDate = DateTime.generateRelativeTimestamp(
          "yyyy-MM-dd",
          requestedStartTs
        );
        if (day.date === bookingDate && !day.closed) {
          console.log("----", day.date, bookingDate);
          for (const booking of day.booked || []) {
            const existingStartTs = DateTime.parseDateToTimestamp(
              `${day.date} ${booking.start}`
            );
            let existingEndTs = DateTime.parseDateToTimestamp(
              `${day.date} ${booking.end}`
            );

            if (existingEndTs <= existingStartTs) {
              existingEndTs += 24 * 60 * 60 * 1000;
            }

            const conflict =
              requestedStartTs < existingEndTs + bufferTime &&
              requestedEndTs > existingStartTs - bufferTime;

            if (conflict) {
              return false;
            }
          }
        }
      }

      return true;
    } catch (e) {
      console.error("Error checking requested time availability:", e);
      return {
        error: "availability_check_error",
        message: `Error checking availability for creator ID: ${creatorId}`,
      };
    }
  }

  static async getUserBookingJson(creatorId, bookingSettings, allTime = false) {
    if (
      !bookingSettings.booking_window_in_minutes ||
      !bookingSettings.timezone
    ) {
      return {
        error: "missing_booking_window",
        message: `Booking window setting is missing for creator ID: ${creatorId}`,
      };
    }

    const setCreatorTimeZone = Utilities.setCreatorTimeZone(creatorId);
    if (!setCreatorTimeZone) return false;

    const bookingWindowInMinutes = parseInt(
      bookingSettings.booking_window_in_minutes,
      10
    );

    const now = new Date();
    const startIso = now.toISOString().slice(0, 19).replace("T", " "); // "YYYY-MM-DD HH:mm:ss"
    const endTimestamp = new Date(
      now.getTime() + bookingWindowInMinutes * 60000
    );
    const endIso = endTimestamp.toISOString().slice(0, 19).replace("T", " ");

    let bookings;
    try {
      if (allTime) {
        bookings = await ScyllaDb.query(
          "fs_bookings",
          "creatorId = :creatorId",
          {
            ":creatorId": `${creatorId}`,
          },

          {
            IndexName: "GSI1",
          }
        );
      } else {
        bookings = await ScyllaDb.query(
          "fs_bookings",
          "creatorId = :creatorId" + allTime
            ? ""
            : " AND startTime BETWEEN :start AND :end",
          {
            ":creatorId": `${creatorId}`,
            ":start": startIso,
            ":end": endIso,
          },
          {
            IndexName: "GSI1",
          }
        );
      }
    } catch (err) {
      console.error(err);
      return {
        error: "query_failed",
        message: err.message || "Failed to retrieve bookings",
      };
    }

    const bookingsByDate = {};

    for (const booking of bookings) {
      const [date, startTime] = booking.startTime.split(" ");
      const [, endTime] = booking.endTime.split(" ");

      if (!bookingsByDate[date]) {
        bookingsByDate[date] = {
          date,
          booked: [],
        };
      }

      bookingsByDate[date].booked.push({
        start: startTime,
        end: endTime,
      });
    }

    return {
      days: Object.values(bookingsByDate),
    };
  }

  static async updateBookingSettings(userId, settingsObject, options = {}) {
    try {
      // Return false if userId is empty
      if (!userId) {
        return false;
      }

      // Convert userId to integer
      userId = parseInt(userId);
      if (isNaN(userId)) {
        return false;
      }

      // Check if the user exists and is valid as a creator
      const userExists = await this.isUserExistsAndValid(userId, "creator");

      // Return the error object if user validation returned an error
      if (userExists?.error) {
        return userExists;
      }

      // Validate and sanitize the settings object
      const validatedSettings =
        this.validateAndSanitizeBookingSettings(settingsObject);

      // Retrieve existing booking settings
      const existingSettings = await this.getCreatorBookingSettings(userId);

      // Merge new settings with existing settings if any, otherwise use the new settings
      const updatedSettings = existingSettings
        ? { ...existingSettings, ...validatedSettings }
        : validatedSettings;

      // Define fields to save

      if (options.expected) {
        for (const key in options.expected) {
          const expectedVal = JSON.stringify(options.expected[key]);
          const actualVal = JSON.stringify(existingSettings[key]);

          if (expectedVal !== actualVal) {
            // Conflict — the current DB value doesn't match what the caller expected
            return {
              error:
                "Booking settings have changed since you last fetched them. Try again.",
              conflictField: key,
            };
          }
        }
      }

      // Update the user's booking settings with the new encoded settings
      const result = await ScyllaDb.putItem("fs_booking_settings", {
        id: userId,
        ...updatedSettings,
      });

      // Return true if the update was successful, false otherwise
      return result !== false;
    } catch (e) {
      console.error("Error updating booking settings:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while updating booking settings.",
      };
    }
  }

  // confused on how to handle the input through the end point
  static validateAndSanitizeBookingSettings(settingsObj) {
    const validatedSettings = {};

    const expectedKeys = {
      timezone: "string",
      min_charge: "int",
      after_hours: "array",
      suspensions: "array",
      booking_buffer: "int",
      advance_booking: "bool",
      instant_booking: "bool",
      max_booking_time: "int",
      min_booking_time: "int",
      negotiation_phase: "bool",
      after_hour_surcharge: "bool",
      default_working_hours: "array",
      booking_window_in_minutes: "int",
      after_hour_token_price_per_minute: "int",
      default_working_hour_token_price_per_minute: "int",
    };

    for (const [key, value] of Object.entries(settingsObj)) {
      if (!expectedKeys.hasOwnProperty(key)) continue;

      const type = expectedKeys[key];
      switch (type) {
        case "int":
          validatedSettings[key] = parseInt(value, 10) || 0;
          break;
        case "bool":
          validatedSettings[key] =
            value === true || value === "true" || value === 1 || value === "1";
          break;
        case "string":
          validatedSettings[key] = sanitizeTextField(value);
          break;
        case "array":
          validatedSettings[key] = Array.isArray(value) ? value : [];
          break;
      }
    }

    return validatedSettings;
  }
  static async getUserIdFromBooking(bookingId, role) {
    const booking_id = String(bookingId);
    if (!booking_id || (role !== "fan" && role !== "creator")) return false;

    if (this.userIdFromBooking[role + booking_id]) {
      return this.userIdFromBooking[role + booking_id];
    }

    try {
      const result = await ScyllaDb.getItem("fs_bookings", {
        booking_ID: String(booking_id),
      });

      if (!result) {
        this.userIdFromBooking[booking_id] = false;
        return false;
      }

      const row = result;
      console.log("🚀 ~ BookingsManager ~ getUserIdFromBooking ~ row:", row);
      const userId = String(role === "fan" ? row.user_ID : row.creatorId);

      if (!userId) {
        this.userIdFromBooking[role + booking_id] = false;
        return false;
      }

      this.userIdFromBooking[role + booking_id] = userId;
      return String(userId);
    } catch (error) {
      console.error("Error in getUserIdFromBooking:", error.message);
      return false;
    }
  }

  static async getBookingStatus(bookingId) {
    if (!bookingId) return false;

    bookingId = parseInt(bookingId);
    if (isNaN(bookingId)) return false;

    try {
      const result = await ScyllaDb.getItem("fs_bookings", {
        booking_ID: String(bookingId),
      });

      if (!result || !result.status) {
        return false;
      }

      return result.status;
    } catch (e) {
      console.error("Error in getBookingStatus:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while retrieving booking status.",
      };
    }
  }

  static async updateBookingStatus(bookingId, newStatus) {
    // Return false if bookingId or newStatus is invalid
    if (
      !bookingId ||
      ![
        "pending",
        "confirmed",
        "completed",
        "cancelled",
        "missed",
        "rescheduled",
      ].includes(newStatus)
    ) {
      return false;
    }

    try {
      // Convert to string and sanitize
      const bookingIdStr = String(bookingId).trim();
      const newStatusStr = newStatus.trim();

      // Check if the booking exists (via scan)
      const booking = await ScyllaDb.getItem("fs_bookings", {
        booking_ID: bookingIdStr,
      });

      if (!booking) {
        return false; // Booking does not exist
      }

      const existing = booking;

      // Set new status
      const auditTrail = booking.auditTrail || [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "update_status",
        actor: "admin",
        metadata: {
          newStatus: newStatusStr,
        },
      });

      const updated = await ScyllaDb.updateItem(
        "fs_bookings",
        {
          booking_ID: existing.booking_ID,
        },
        {
          status: newStatusStr,
          auditTrail,
        }
      );

      return !!updated;
    } catch (e) {
      console.error("Error updating booking status:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while updating booking status.",
      };
    }
  }

  static async bookingExists(bookingId) {
    // Return false if bookingId is empty
    if (!bookingId) {
      return false;
    }

    // Convert to string and trim
    const bookingIdStr = String(bookingId).trim();

    // Scan the fs_bookings table for a matching booking_ID
    try {
      const result = await ScyllaDb.getItem("fs_bookings", {
        booking_ID: bookingIdStr,
      });

      return !!result;
    } catch (e) {
      console.log("Error in bookingExists:", e);
      return false;
    }
  }

  static async setBookingStatus(bookingId, newStatus) {
    // Return false if bookingId or newStatus is empty
    const validStatuses = [
      "pending",
      "confirmed",
      "completed",
      "cancelled",
      "missed",
      "rescheduled",
    ];
    if (!bookingId || !newStatus) {
      return false;
    }

    // Validate newStatus
    if (!validStatuses.includes(newStatus)) {
      return false;
    }

    // Convert bookingId to string (assuming it's string in DB) and trim newStatus
    const bookingIdStr = String(bookingId).trim();
    const sanitizedStatus = newStatus.trim();

    try {
      // Scan for the item with matching booking_ID
      const item = await ScyllaDb.getItem("fs_bookings", {
        booking_ID: bookingIdStr,
      });

      if (!item) {
        // No matching booking found
        return false;
      }

      // Update the status field of the item

      item.status = sanitizedStatus;
      const auditTrail = item.auditTrail || [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "set_status",
        actor: "admin",
        metadata: {
          newStatus: sanitizedStatus,
        },
      });
      // Write back the updated item
      const updateResult = await ScyllaDb.putItem("fs_bookings", item);

      // Return true if update was successful (assuming put returns truthy on success)
      return !!updateResult;
    } catch (e) {
      console.error("Error in setBookingStatus:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while setting booking status.",
      };
    }
  }

  static async getUpcomingBookings(userId = null, windowInMinutes = 60) {
    windowInMinutes = Number(windowInMinutes);

    const currentTime = DateTime.now("yyyy-MM-dd HH:mm:ss");
    // interval format: "+<minutes> minute(s)"
    const windowEndTime = DateTime.generateRelativeTimestamp(
      "yyyy-MM-dd HH:mm:ss",
      `+${windowInMinutes} minutes`
    );
    const windowEndDateObj = new Date(windowEndTime);

    const todayDate = currentTime.slice(0, 10); // "YYYY-MM-DD"

    // We'll scan the table with filtering logic similar to the SQL query
    let items;
    try {
      const [asUser, asCreator] = await Promise.all([
        ScyllaDb.query(
          "fs_bookings",
          "user_ID = :uid",
          {
            ":uid": userId,
          },
          {
            IndexName: "GSI2",
          }
        ),

        ScyllaDb.query(
          "fs_bookings",
          "creatorId = :uid",
          {
            ":uid": userId,
          },
          {
            IndexName: "GSI1",
          }
        ),
      ]);

      // Merge and deduplicate by booking_ID
      const merged = [...asUser, ...asCreator];
      const seen = new Set();
      items = merged.filter((b) => {
        if (seen.has(b.booking_ID)) {
          return false;
        }
        // console.log("adding ...", b.booking_ID);
        seen.add(b.booking_ID);
        return true;
      });
      // items = await ScyllaDb.scan("fs_bookings");
    } catch (e) {
      console.error("Error scanning fs_bookings:", e);
      return {
        error: "scan_error",
        message: "Failed to retrieve bookings from the database.",
      };
    }

    // Filter matching bookings with the complex conditions from PHP
    const filtered = items.filter((item) => {
      if (item.status !== "pending") return false;

      const isRecurring = !!item.recurrenceRule;

      if (!isRecurring) {
        // One-time booking logic
        const bookingDate = item.startTime.slice(0, 10);
        const bookingStartTime = item.startTime.slice(11);
        const bookingStartDateTime = item.startTime;

        const cond1 =
          bookingDate === todayDate &&
          bookingStartTime >= currentTime.slice(11) &&
          bookingStartTime <= windowEndTime.slice(11);

        const cond2 =
          bookingDate > todayDate &&
          bookingStartDateTime >= currentTime &&
          bookingStartDateTime <= windowEndTime;

        if (!(cond1 || cond2)) return false;
      } else {
        // Recurring booking logic
        function parseToDateObject(timestamp) {
          const [datePart, timePart] = timestamp.split(" "); // "2025-07-03", "18:30:00"
          const [year, month, day] = datePart.split("-").map(Number);
          const [hour, minute, second] = timePart.split(":").map(Number);
          return new Date(year, month - 1, day, hour, minute, second);
        }

        const nowDateObj = parseToDateObject(currentTime);
        const windowEndDateObj = parseToDateObject(windowEndTime);
        try {
          const dtstart = parseToDateObject(item.startTime);
          const rule = RRule.fromString(item.recurrenceRule).options;
          const rrule = new RRule({ ...rule, dtstart });
          const occurrences = rrule.between(nowDateObj, windowEndDateObj);
          if (occurrences.length === 0) return false;
        } catch (err) {
          console.error(
            `Invalid recurrence rule for booking ID ${item.id}`,
            err
          );
          return false;
        }
      }

      return true;
    });

    return filtered;
  }

  static async getBookingDetails(bookingId) {
    if (!bookingId) return false;

    try {
      // ScyllaDB stores booking_ID as a string
      const result = await ScyllaDb.getItem("fs_bookings", {
        booking_ID: String(bookingId),
      });
      console.log("🚀 ~ BookingsManager ~ getBookingDetails ~ result:", result);
      return result;
    } catch (e) {
      console.error("Error in getBookingDetails:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while retrieving booking details.",
      };
    }
  }

  static async getUpcomingBookingSessions(creatorId) {
    if (!creatorId) return false;

    try {
      // Resolve creator's timezone (mocking the PHP `set_creator_time_zone`)
      const creatorTimeZone = await Utilities.setCreatorTimeZone(creatorId); // Should return a valid IANA timezone

      if (!creatorTimeZone) {
        return { error: "Invalid or missing timezone for creator" };
      }

      // Get current time and +5 minutes in creator's timezone
      // TODO: add time zone
      const currentTime = DateTime.now("yyyy-MM-dd HH:mm:ss", creatorTimeZone);
      const fiveMinutesLater = DateTime.generateRelativeTimestamp(
        "yyyy-MM-dd HH:mm:ss",
        "+5 minutes",
        creatorTimeZone
      );

      const items = await ScyllaDb.scan("fs_bookings");

      const filtered = items.filter((item) => {
        if (item.status !== "pending") return false;
        if (String(item.creatorId) !== String(creatorId)) return false;

        const startTime = item.startTime; // e.g. "2025-07-05 10:01:00"
        if (!startTime) return false;

        return (
          DateTime.isBetween(startTime, currentTime, fiveMinutesLater) === true
        );
      });

      return filtered;
    } catch (e) {
      console.error("Error in getUpcomingBookingSessions:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while retrieving upcoming booking sessions.",
      };
    }
  }
  static async registerReadyState(bookingId, userType) {
    if (!bookingId || !["fan", "creator"].includes(userType)) {
      return false;
    }

    const tableName = "fs_bookings";
    const readyTime = DateTime.now(); // Format as ISO8601 or your app’s format

    try {
      const booking = await ScyllaDb.getItem(tableName, {
        booking_ID: String(bookingId),
      });

      const auditTrail = booking.auditTrail || [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "register_ready_state",
        actor: userType === "creator" ? booking.creatorId : booking.user_ID,
        metadata: {},
      });
      const updateResult = await ScyllaDb.updateItem(
        tableName,
        { booking_ID: bookingId }, // primary key
        {
          ready_state_time: readyTime,
          ready_by: userType.trim().toLowerCase(),
        }
      );

      return !!updateResult;
    } catch (err) {
      console.error("Failed to register ready state:", err.message);
      return false;
    }
  }
  static async registerMissedBooking(bookingId, missedBy) {
    if (!bookingId || !missedBy) return false;

    const sanitizedMissedBy = missedBy.trim().toLowerCase();
    const validMissers = ["fan", "creator", "both"];
    if (!validMissers.includes(sanitizedMissedBy)) return false;

    const booking_id = String(parseInt(bookingId));
    const tableName = "fs_bookings";

    try {
      // Set new status
      const booking = await ScyllaDb.getItem(tableName, {
        booking_ID: booking_id,
      });
      const auditTrail = booking.auditTrail || [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "missed_booking",
        actor:
          sanitizedMissedBy === "creator" ? booking.creatorId : booking.user_ID,
        metadata: {},
      });
      const result = await ScyllaDb.updateItem(
        tableName,
        { booking_ID: bookingId },
        {
          call_status: "no_show",
          missed_by: sanitizedMissedBy,
          auditTrail,
        }
      );

      if (!result) return false;

      // If creator missed the call
      if (sanitizedMissedBy === "creator" || sanitizedMissedBy === "both") {
        const creatorId = await this.getUserIdFromBooking(
          booking_id,
          "creator"
        );
        if (!creatorId) return false;

        const userSettings = await ScyllaDb.getItem("fs_booking_settings", {
          id: String(creatorId),
        });
        const currentCount = parseInt(userSettings?.no_show_count) || 0;
        const updated = await ScyllaDb.updateItem(
          "fs_booking_settings",
          {
            id: String(creatorId),
          },
          {
            no_show_count: currentCount + 1,
          }
        );

        return updated !== false;
      }

      // If fan missed the call
      if (sanitizedMissedBy === "fan" || sanitizedMissedBy === "both") {
        const fanId = await this.getUserIdFromBooking(booking_id, "fan");
        if (!fanId) return false;

        const released = Tokens.releaseDepositTokens(booking_id);
        return released;
      }

      return false;
    } catch (err) {
      console.error("registerMissedBooking error:", err);
      return false;
    }
  }

  static async countMissedBooking(creatorId) {
    if (!creatorId) return false;

    try {
      const timezoneSet = await Utilities.setCreatorTimeZone(creatorId);
      if (!timezoneSet) return false;

      const creator_id = parseInt(creatorId);

      const userSettings = await Users.getUserFields(creator_id, [
        "no_show_count",
      ]);
      const missedCallCount = parseInt(userSettings?.no_show_count || 0);

      return missedCallCount >= 3 ? 3 : missedCallCount;
    } catch (e) {
      console.error("Error in countMissedBooking:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while counting missed bookings.",
      };
    }
  }

  // Note
  static async resetNoShowCountAndLiftSuspension(creatorId) {
    try {
      const timezone = await Utilities.setCreatorTimeZone(creatorId);
      if (!timezone) return false;

      const updated = await ScyllaDb.updateItem(
        "fs_booking_settings",
        {
          id: creatorId,
        },
        {
          no_show_count: 0,
        }
      );
      if (!updated) return false;

      const bookingSettings = await this.getCreatorBookingSettings(creatorId);
      if (!bookingSettings || !Array.isArray(bookingSettings.suspensions))
        return false;

      let currentDate = DateTime.now("Y-m-d", timezone);

      let hasActiveSuspension = false;

      for (const suspension of bookingSettings.suspensions) {
        if (
          suspension.status === "active" &&
          new Date(suspension.end_date) <= new Date(currentDate)
        ) {
          suspension.status = "suspension_lifted";
          hasActiveSuspension = true;
        }
      }

      if (hasActiveSuspension) {
        const updateResult = await this.updateBookingSettings(
          creatorId,
          bookingSettings,
          { expected: { suspensions: currentSettings.suspensions } }
        );
        return updateResult !== false;
      }

      return false;
    } catch (e) {
      console.error("Error in resetNoShowCountAndLiftSuspension:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while resetting no-show count.",
      };
    }
  }

  static async revokeBookingSuspension(creatorId, date = null) {
    if (!creatorId) return false;
    try {
      const timezone = await Utilities.setCreatorTimeZone(creatorId);
      if (!timezone) return false;

      if (!date) {
        date = DateTime.now("Y-m-d", timezone);
      }

      const bookingSettings = await this.getCreatorBookingSettings(creatorId);
      if (!bookingSettings || !Array.isArray(bookingSettings.suspensions)) {
        return false;
      }

      const originalSuspensions = bookingSettings.suspensions;
      const checkDate = new Date(date);

      const updatedSuspensions = originalSuspensions.filter((suspension) => {
        const start = new Date(suspension.start_date);
        const end = new Date(suspension.end_date);

        // Keep suspensions that don't include the checkDate
        return !(checkDate >= start && checkDate <= end);
      });

      if (updatedSuspensions.length === originalSuspensions.length) {
        return false; // No suspensions were removed
      }

      const result = await ScyllaDb.updateItem(
        "fs_booking_settings",
        {
          id: String(creatorId),
        },
        {
          suspensions: updatedSuspensions,
        }
      );
      return result !== false;
    } catch (e) {
      console.error("Error in revokeBookingSuspension:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while revoking booking suspension.",
      };
    }
  }

  static async rescheduleBooking(
    creatorId,
    bookingId,
    type,
    newDate = null,
    newTime = null
  ) {
    if (!creatorId || !bookingId || !type) {
      return false;
    }

    // Set the timezone for the creator

    let timezone;
    try {
      timezone = await Utilities.setCreatorTimeZone(creatorId);
    } catch (e) {
      console.error("Error setting creator timezone:", e);
      return {
        error: "timezone_error",
        message: "Failed to set creator timezone.",
      };
    }

    // Return false if timezone could not be determined
    if (!timezone) {
      return false;
    }

    // Sanitize and validate inputs
    creatorId = parseInt(creatorId);
    bookingId = parseInt(bookingId);
    type = String(type).trim();

    // Handle newDate if provided
    if (newDate) {
      newDate = String(newDate).trim();
    }

    // Handle newTime if provided
    if (newTime) {
      newTime = String(newTime).trim();
    }
    let booking;

    try {
      booking = await this.getBookingDetails(bookingId);
    } catch (e) {
      console.error("Error fetching booking details:", e);
      return {
        error: "booking_error",
        message: "Failed to retrieve booking details.",
      };
    }

    if (!booking) {
      return false;
    }

    const currentBookingDate = DateTime.formatDate(
      booking.startTime,
      "yyyy-MM-dd"
    );
    const currentBookingStartTime = DateTime.formatDate(
      booking.startTime,
      "HH:mm:ss"
    );
    const currentBookingEndTime = DateTime.formatDate(
      booking.endTime,
      "HH:mm:ss"
    );

    let updatePayload;

    if (type === "partial" && newTime) {
      const startDate = DateTime.formatDate(booking.startTime, "yyyy-MM-dd");
      const newStart = `${startDate} ${newTime}`;

      const newStartTs = DateTime.parseDateToTimestamp(newStart, timezone);
      const oldStartTs = DateTime.parseDateToTimestamp(
        booking.startTime,
        timezone
      );
      const oldEndTs = DateTime.parseDateToTimestamp(booking.endTime, timezone);
      const duration = oldEndTs - oldStartTs;

      const newEnd = DateTime.generateRelativeTimestamp(
        "HH:mm:ss",
        newStartTs + duration,
        timezone
      );

      // Optional: check availability
      // const isAvailable = await checkAvailability(creatorId, startDate, newTime, newEnd);
      // if (!isAvailable) return false;

      updatePayload = {
        startTime: `${startDate} ${newTime}`,
        endTime: `${startDate} ${newEnd}`,
      };
    } else if (type === "full" && newDate && newTime) {
      const newStart = `${newDate} ${newTime}`;

      const newStartTs = DateTime.parseDateToTimestamp(newStart, timezone);
      const oldStartTs = DateTime.parseDateToTimestamp(
        booking.startTime,
        timezone
      );
      const oldEndTs = DateTime.parseDateToTimestamp(booking.endTime, timezone);
      const duration = oldEndTs - oldStartTs;

      const newEnd = DateTime.generateRelativeTimestamp(
        "HH:mm:ss",
        newStartTs + duration,
        timezone
      );

      // Optional: check availability
      // const isAvailable = await checkAvailability(creatorId, newDate, newTime, newEnd);
      // if (!isAvailable) return false;

      updatePayload = {
        startTime: `${newDate} ${newTime}`,
        endTime: `${newDate} ${newEnd}`,
      };
    } else {
      console.error("should either be full or partial");
      return false;
    }

    try {
      const auditTrail = Array.isArray(booking.auditTrail)
        ? booking.auditTrail
        : [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "rescheduled",
        actor: creatorId,
        metadata: {
          rescheduleType: type,
          ...updatePayload,
        },
      });
      updatePayload.auditTrail = auditTrail;
      const updatedItem = await ScyllaDb.updateItem(
        "fs_bookings",
        { booking_ID: String(bookingId) },
        updatePayload
      );
      return !!updatedItem;
    } catch (err) {
      console.error("Failed to update booking:", err.message);
      return false;
    }
  }

  static async requestRescheduleBooking(creatorId, bookingId, percentBase) {
    if (!creatorId || !bookingId || !percentBase) {
      return false;
    }

    const creatorTimezone = Utilities.setCreatorTimeZone(creatorId);
    if (!creatorTimezone) return false;

    let booking;
    try {
      booking = await this.getBookingDetails(bookingId);
      if (!booking) return false;
    } catch (e) {
      console.error("Error fetching booking details:", e);
      return {
        error: "booking_error",
        message: "Failed to retrieve booking details.",
      };
    }

    // Prepare audit log entry
    const auditEntry = {
      at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
      action: "request_reschedule",
      by: creatorId,
      payload: { percentBase: parseFloat(percentBase) },
    };

    let auditTrail = [];
    try {
      auditTrail = Array.isArray(booking.auditTrail)
        ? booking.auditTrail
        : booking.auditTrail || [];
    } catch {
      auditTrail = [];
    }

    auditTrail.push(auditEntry);

    try {
      const result = await ScyllaDb.updateItem(
        "fs_bookings",
        { booking_ID: bookingId }, // PK
        { auditTrail }
      );
      return !!result;
    } catch (err) {
      console.error("Failed to update auditTrail:", err.message);
      return false;
    }
  }

  static async acceptRescheduleBooking(bookingId) {
    if (!bookingId) return false;

    let booking;
    try {
      booking = await this.getBookingDetails(bookingId);
      if (!booking) return false;
    } catch (e) {
      console.error("Error fetching booking details:", e);
      return {
        error: "booking_error",
        message: "Failed to retrieve booking details.",
      };
    }

    let auditTrail = [];
    try {
      auditTrail = Array.isArray(booking.auditTrail)
        ? booking.auditTrail
        : booking.auditTrail || [];
    } catch {
      auditTrail = [];
    }

    auditTrail.push({
      action: "accept_reschedule",
      by: "system", // or an admin ID if applicable
      at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
    });

    try {
      const result = await ScyllaDb.updateItem(
        "fs_bookings",
        { booking_ID: bookingId }, // PK
        {
          status: "rescheduled",
          auditTrail,
        }
      );
      return !!result;
    } catch (err) {
      console.error("acceptRescheduleBooking failed:", err.message);
      return false;
    }
  }

  static async declineRescheduleBooking(creatorId, bookingId, reason) {
    if (!creatorId || !bookingId || !reason?.trim()) return false;

    let booking;
    try {
      booking = await this.getBookingDetails(bookingId);
      if (!booking) return false;
    } catch (e) {
      console.error("Error fetching booking details:", e);
      return {
        error: "booking_error",
        message: "Failed to retrieve booking details.",
      };
    }

    const timezone = booking.timezone || "UTC"; // fallback if creator timezone isn’t stored

    let auditTrail = [];
    try {
      auditTrail = Array.isArray(booking.auditTrail)
        ? booking.auditTrail
        : booking.auditTrail || [];
    } catch {
      auditTrail = [];
    }

    auditTrail.push({
      action: "decline_reschedule",
      reason: reason.trim(),
      by: creatorId,
      at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
    });

    try {
      const result = await ScyllaDb.updateItem(
        "fs_bookings",
        { booking_ID: bookingId },
        {
          auditTrail,
          status: "declined",
        }
      );
      return !!result;
    } catch (err) {
      console.error("declineRescheduleBooking failed:", err.message);
      return false;
    }
  }

  static getEmailBody(bookingDetails, target, condition) {
    // The parameters of this function have already been validated. Please ensure proper usage.

    // Define the email body template.
    const bodyTemplate = `
		<h2>Booking Notification</h2>
		<p>Dear {recipient_name},</p>
		<p>Your booking (No: {booking_id}) has been updated based on the following status: {status}.</p>
		<p>Date: {date}</p>
		<p>Time: {time}</p>
		<p>Thank you,</p>
		<p>Fansocial Team</p>
	`;

    // Retrieve and sanitize booking details.
    const fanId = parseInt(bookingDetails.user_ID);
    const creatorId = parseInt(bookingDetails.creatorId);
    const bookingId = parseInt(bookingDetails.booking_ID);
    const bookingDate = sanitizeTextField(
      DateTime.formatDate(bookingDetails.startTime, "yyyy-MM-dd")
    );
    const bookingStartTime = sanitizeTextField(bookingDetails.startTime).slice(
      11
    ); // Extract time part "HH:mm:ss"

    // Get the recipient's name.
    let recipientName;
    if (target === "fan") {
      recipientName = Users.getUserDisplayName(fanId);
    }
    if (target === "creator") {
      recipientName = Users.getUserDisplayName(creatorId);
    }

    // Populate the template with booking and recipient information.
    const body = bodyTemplate
      .replace("{recipient_name}", recipientName)
      .replace("{booking_id}", bookingId)
      .replace("{status}", this.capitalizeCondition(condition))
      .replace("{date}", bookingDate)
      .replace("{time}", bookingStartTime);

    // Return the completed email body.
    return body;
  }

  // Helper to convert "reschedule_requested" → "Reschedule requested"
  static capitalizeCondition(condition) {
    return condition.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }

  static async sendNotificationEmail(bookingDetails, target, condition) {
    // The parameters of this function have already been validated. Please ensure proper usage.

    // Set default email subject.
    let subject = "Booking Notification";

    // Update subject based on condition if available.
    if (this.subjects?.[condition] && this.subjects[condition]?.[target]) {
      subject = this.subjects[condition][target];
    }

    // Generate the email body content.
    const body = this.getEmailBody(bookingDetails, target, condition);

    // Retrieve and validate fan and creator IDs from booking details.
    const fanId = String(parseInt(bookingDetails.user_ID));
    const creatorId = String(parseInt(bookingDetails.creatorId));

    let userInfo, recipientEmail;

    if (target === "fan") {
      userInfo = await Users.getUserById(fanId); // assume returns { email: ... }
      recipientEmail = userInfo?.email;
    }

    if (target === "creator") {
      userInfo = await Users.getUserById(creatorId);
      recipientEmail = userInfo?.email;
    }

    // Fallback in case email couldn't be resolved.
    if (!recipientEmail) return;

    // Set email headers (not needed explicitly in nodemailer, shown for parity).
    const headers = {
      "Content-Type": "text/html; charset=UTF-8",
    };

    // Send the notification email using nodemailer or your preferred method.
    try {
      await sendEmail(recipientEmail, subject, body, headers);
    } catch (e) {
      console.error("Error sending notification email:", e.message);
      return {
        error: "email_error",
        message: "Failed to send notification email.",
      };
    }
  }

  static async addNotificationBookingStatus(args) {
    // The parameters of this function have already been validated. Please ensure proper usage.

    const userId = args.user_id;
    const notice = args.notice;
    const type = "info";
    const priority = "high";
    const flag = "booking-notification";
    const icon = "info";

    // Prepare arguments for the 'addNotification' function.
    const addNotificationArgs = {
      user_id: userId,
      notice: notice,
      type: type,
      priority: priority,
      flag: flag,
      icon: icon,
    };

    // Call the 'addNotification' function to add the notification.
    try {
      await Notification.addNotification(addNotificationArgs);
    } catch (e) {
      console.error("Error adding notification booking status:", e.message);
      return {
        error: "notification_error",
        message: "Failed to add notification booking status.",
      };
    }
  }

  // Placeholder function
  static async notifyBookingStatusChange(bookingId, condition) {
    // Return false if the booking ID and condition are not provided.
    if (!bookingId || !condition) {
      return false;
    }

    // Sanitize and validate the booking ID.
    bookingId = String(parseInt(bookingId));
    condition = sanitizeTextField(condition);

    // Check if the notification condition exists; return false if invalid.
    if (!this.notifyConditions[condition]) {
      return false;
    }

    // Retrieve the notification targets based on the condition.
    const notifyTargets = this.notifyConditions[condition];

    // Send notifications to each target based on the specified condition.
    for (const target of notifyTargets) {
      // Prepare the notice message.
      const notice =
        condition.charAt(0).toUpperCase() +
        condition.slice(1).replace(/_/g, " ") +
        " for Booking ID " +
        bookingId;

      // Retrieve booking details.
      let bookingDetails;
      try {
        bookingDetails = await this.getBookingDetails(bookingId);
      } catch (e) {
        console.error("Error retrieving booking details:", e.message);
        return {
          error: "booking_error",
          message: "Failed to retrieve booking details.",
        };
      }

      // Return false if either fan ID or creator ID in booking details is missing.
      if (!bookingDetails?.user_ID || !bookingDetails?.creatorId) {
        return false;
      }

      // Retrieve and validate fan and creator IDs from booking details.
      const fanId = parseInt(bookingDetails.user_ID);
      const creatorId = parseInt(bookingDetails.creatorId);

      // Define notification arguments directly.
      const notificationArgs = {
        user_id: String(target === "fan" ? fanId : creatorId),
        notice: notice,
      };

      // Send notifications based on the target.
      try {
        switch (target) {
          case "fan":
            await this.sendNotificationEmail(bookingDetails, "fan", condition);
            break;

          case "creator":
            await this.sendNotificationEmail(
              bookingDetails,
              "creator",
              condition
            );
            break;

          case "both":
            await this.sendNotificationEmail(bookingDetails, "fan", condition);
            await this.sendNotificationEmail(
              bookingDetails,
              "creator",
              condition
            );
            break;

          default:
            return false; // Handle unexpected targets gracefully.
        }

        // Add notification booking status after sending the email.
        await this.addNotificationBookingStatus(notificationArgs);
      } catch (e) {
        console.error("Error sending notification email:", e.message);
        return {
          error: "internal_error",
          message: "Failed to send notification email.",
        };
      }
    }

    // Return true after notifications have been sent.
    return true;
  }

  static async getCreatorsBookings(userId) {
    if (!userId) return [];

    userId = String(userId);

    const rolesAndIndexes = [
      { role: "fan", indexName: "GSI2", indexKey: "user_ID" },
      { role: "creator", indexName: "GSI1", indexKey: "creatorId" },
    ];

    for (const { indexName, indexKey } of rolesAndIndexes) {
      try {
        const bookings = await ScyllaDb.query(
          "fs_bookings",
          `#pk = :pk`,
          { ":pk": userId },
          {
            IndexName: indexName,
            ExpressionAttributeNames: { "#pk": indexKey },
            ScanIndexForward: true,
          }
        );

        if (bookings && bookings.length > 0) {
          return bookings;
        }
      } catch (err) {
        console.error(`Error querying with index ${indexName}:`, err);
      }
    }

    return [];
  }

  static async addAdminNote(bookingId, note) {
    if (!bookingId || !note) {
      return false;
    }

    bookingId = String(bookingId);
    note = sanitizeTextField(note);

    try {
      const booking = await this.getBookingDetails(bookingId);
      if (!booking) {
        return false;
      }

      const auditTrail = booking.auditTrail || [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "add_admin_note",
        actor: "admin",
        metadata: {},
      });

      let adminNotes = Array.isArray(booking.adminNotes)
        ? booking.adminNotes
        : [];

      adminNotes.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        note: note,
      });

      const result = await ScyllaDb.updateItem(
        "fs_bookings",
        { booking_ID: bookingId },
        { adminNotes, auditTrail }
      );

      return !!result;
    } catch (e) {
      console.error("Error in addAdminNote:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while adding admin note.",
      };
    }
  }

  static async editAdminNotes(bookingId, noteIndex, newNote) {
    if (!bookingId || noteIndex === undefined || !newNote) {
      return false;
    }
    bookingId = String(bookingId);
    noteIndex = parseInt(noteIndex, 10);
    newNote = sanitizeTextField(newNote);
    if (isNaN(noteIndex)) {
      return false; // Invalid note index
    }
    try {
      const booking = await this.getBookingDetails(bookingId);
      if (!booking || !Array.isArray(booking.adminNotes)) {
        return false; // Booking not found or no admin notes
      }
      if (noteIndex < 0 || noteIndex >= booking.adminNotes.length) {
        return false; // Note index out of bounds
      }

      const auditTrail = booking.auditTrail || [];
      auditTrail.push({
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        action: "edit_admin_note",
        actor: "admin",
        metadata: { index: noteIndex },
      });

      // Update the specific note
      booking.adminNotes[noteIndex] = {
        at: DateTime.now("yyyy-MM-dd HH:mm:ss", null),
        note: newNote,
      };
      const result = await ScyllaDb.updateItem(
        "fs_bookings",
        { booking_ID: bookingId },
        { adminNotes: booking.adminNotes, auditTrail }
      );
      return !!result; // Return true if update was successful
    } catch (e) {
      console.error("Error in editAdminNotes:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while editing admin notes.",
      };
    }
  }

  //--------------------------------------------------------------//

  static async applyMissedBookingSuspension(creatorId) {
    if (!creatorId) {
      return false;
    }

    try {
      const setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
      if (!setCreatorTimeZone) {
        return false;
      }
      creatorId = Math.abs(parseInt(creatorId, 10));
      const currentDate = DateTime.now();
      const suspensionEndDate = DateTime.generateRelativeTimestamp(
        "yyy-MM-dd HH:mm:ss",
        "+1 month",
        setCreatorTimeZone
      );
      const tableName = "fs_bookings";

      const bookingSettings = await this.getCreatorBookingSettings(creatorId);
      let liftedBookingIds = [];

      if (
        bookingSettings.suspensions &&
        Array.isArray(bookingSettings.suspensions)
      ) {
        bookingSettings.suspensions.forEach((suspension) => {
          if (
            suspension.status === "suspension_lifted" &&
            suspension.no_shows_booking_ids &&
            suspension.no_shows_booking_ids.length > 0
          ) {
            liftedBookingIds.push(...suspension.no_shows_booking_ids);
          }
        });
      }
      // Ensure unique IDs in liftedBookingIds
      liftedBookingIds = [...new Set(liftedBookingIds)];
      let query;
      if (liftedBookingIds.length > 0) {
        // Create placeholders for excluding lifted booking IDs in the query
        const excludedPlaceholders = liftedBookingIds.map(() => "?").join(",");
        query = {
          filter: (item) =>
            item.creatorId === String(creatorId) &&
            item.call_status === "no_show" &&
            !liftedBookingIds.includes(item.booking_ID),
        };
      } else {
        query = {
          filter: (item) =>
            item.creatorId === String(creatorId) &&
            item.call_status === "no_show",
        };
      }
      const results = (await ScyllaDb.scan(tableName)).filter(query.filter);

      const missedBookingIds = results.map((item) => item.booking_id);
      const suspensionResult = await this.addBookingSuspensionPeriod(
        creatorId,
        currentDate,
        suspensionEndDate,
        missedBookingIds,
        "active"
      );
      return suspensionResult;
    } catch (e) {
      console.error("Error in applyMissedBookingSuspension:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while applying missed booking suspension.",
      };
    }
  }

  static async addBookingSuspensionPeriod(
    creatorId,
    startDate,
    endDate,
    noShowsBookingIds = null,
    suspensionStatus = "active"
  ) {
    if (!creatorId || !startDate || !endDate) {
      return false;
    }
    try {
      const setCreatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
      if (!setCreatorTimeZone) {
        return false;
      }
      creatorId = Math.abs(parseInt(creatorId, 10));
      startDate = sanitizeTextField(startDate);
      endDate = sanitizeTextField(endDate);
      const bookingSettings = await this.getCreatorBookingSettings(creatorId);
      if (!bookingSettings) {
        return false;
      }
      const newSuspension = {
        start_date: startDate,
        end_date: endDate,
        status: suspensionStatus,
      };

      if (noShowsBookingIds && Array.isArray(noShowsBookingIds)) {
        newSuspension.no_shows_booking_ids = noShowsBookingIds;
      }

      if (
        !bookingSettings.suspensions ||
        !Array.isArray(bookingSettings.suspensions)
      ) {
        bookingSettings.suspensions = [];
      }

      bookingSettings.suspensions.push(newSuspension);
      const saveFields = {
        booking_settings: JSON.stringify(bookingSettings),
      };
      const result = await Users.updateUserFields(
        creatorId,
        "creator",
        saveFields
      );
      return result !== false;
    } catch (e) {
      console.error("Error in addBookingSuspensionPeriod:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while adding booking suspension period.",
      };
    }
  }

  static async calculateTimeSlots(
    creatorId,
    startTime,
    endTime,
    bookings,
    buffer
  ) {
    if (!startTime || !endTime || !buffer) {
      console.error("Missing required params");
      return false;
    }

    creatorId = Math.abs(parseInt(creatorId, 10));
    buffer = Math.abs(parseInt(buffer, 10));
    let creatorTimeZone;
    try {
      creatorTimeZone = await Utilities.setCreatorTimeZone(creatorId);
    } catch (e) {
      console.error("Error setting creator timezone:", e);
      return {
        error: "timezone_error",
        message: "Failed to set creator timezone.",
      };
    }

    if (!creatorTimeZone) {
      console.error("Could not resolve creator timezone");
      return false;
    }

    // Helper: safely parse date string or number to Unix timestamp (in seconds)
    const parseToTimestamp = (value) => {
      if (typeof value === "number") return Math.floor(value);
      const ts = DateTime.parseDateToTimestamp(value, creatorTimeZone);
      return ts && !isNaN(ts) ? Math.floor(ts) : false;
    };

    const parsedStart = parseToTimestamp(startTime);
    const parsedEnd = parseToTimestamp(endTime);

    if (!parsedStart || !parsedEnd) {
      console.error("Invalid startTime or endTime", { parsedStart, parsedEnd });
      return false;
    }

    startTime = parsedStart;
    endTime = parsedEnd;

    if (!Array.isArray(bookings)) {
      console.error("Bookings is not an array");
      return false;
    }

    // Sort bookings by start time (with timezone)
    bookings.sort((a, b) => {
      const tsA = parseToTimestamp(a.startTime);
      const tsB = parseToTimestamp(b.startTime);
      return tsA - tsB;
    });

    const availableWindows = [];
    let currentTime = startTime;

    for (const booking of bookings) {
      const bookingStart = parseToTimestamp(booking.startTime);
      const bookingEnd = parseToTimestamp(booking.endTime);

      if (!bookingStart || !bookingEnd) {
        console.error("Invalid booking entry", booking);
        return false;
      }

      const adjustedStart = bookingStart - buffer * 60;
      const adjustedEnd = bookingEnd + buffer * 60;

      if (currentTime < adjustedStart) {
        availableWindows.push({
          startTime: DateTime.generateRelativeTimestamp(
            "yyyy-MM-dd HH:mm:ss",
            currentTime,
            creatorTimeZone
          ),
          endTime: DateTime.generateRelativeTimestamp(
            "yyyy-MM-dd HH:mm:ss",
            Math.min(adjustedStart, endTime),
            creatorTimeZone
          ),
        });
      }

      currentTime = Math.max(currentTime, adjustedEnd);
    }

    // Final window after last booking
    if (currentTime < endTime) {
      availableWindows.push({
        startTime: DateTime.generateRelativeTimestamp(
          "yyyy-MM-dd HH:mm:ss",
          currentTime,
          creatorTimeZone
        ),
        endTime: DateTime.generateRelativeTimestamp(
          "yyyy-MM-dd HH:mm:ss",
          endTime,
          creatorTimeZone
        ),
      });
    }

    return availableWindows;
  }

  static async hasModelEnabledBooking(creatorId) {
    try {
      const settings = await this.getCreatorBookingSettings(creatorId);

      if (!settings || settings instanceof Error) {
        return false;
      }

      return Boolean(settings.advance_booking);
    } catch (e) {
      console.error("Error in hasModelEnabledBooking:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while checking booking settings.",
      };
    }
  }

  static async hasModelEnabledNegotiation(creatorId) {
    let settings;
    try {
      settings = await this.getCreatorBookingSettings(creatorId);
    } catch (e) {
      console.error("Error in hasModelEnabledNegotiation:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while checking negotiation settings.",
      };
    }

    if (!settings || settings?.error) {
      return false;
    }

    return Boolean(settings.negotiation_phase);
  }

  static async getBookingBufferTime(creatorId) {
    let settings;
    try {
      settings = await this.getCreatorBookingSettings(creatorId);
    } catch (e) {
      console.error("Error in getBookingBufferTime:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while retrieving booking buffer time.",
      };
    }

    if (!settings || settings?.error) {
      return false;
    }

    return settings.booking_buffer !== undefined &&
      settings.booking_buffer !== null
      ? parseInt(settings.booking_buffer, 10)
      : false;
  }

  static async getMinimumBookingTime(creatorId) {
    let settings;
    try {
      settings = await this.getCreatorBookingSettings(creatorId);
    } catch (e) {
      console.error("Error in getBookingBufferTime:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while retrieving booking buffer time.",
      };
    }
    if (!settings || settings?.error) {
      return false;
    }

    return settings.min_booking_time !== undefined &&
      settings.min_booking_time !== null
      ? parseInt(settings.min_booking_time, 10)
      : false;
  }

  static async getMaximumBookingTime(creatorId) {
    let settings;
    try {
      settings = await this.getCreatorBookingSettings(creatorId);
    } catch (e) {
      console.error("Error in getBookingBufferTime:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while retrieving booking buffer time.",
      };
    }
    if (!settings || settings?.error) {
      return false;
    }

    return settings.max_booking_time
      ? parseInt(settings.max_booking_time, 10)
      : false;
  }

  static async handleCreateBooking(
    fanId,
    creatorId,
    bookingDate,
    bookingStart,
    bookingEnd,
    baseCharge,
    negotiationPhase = false,
    initialTokenCharge = []
  ) {
    if (!fanId || !creatorId || !bookingDate || !bookingStart || !bookingEnd) {
      return {
        error: "missing_required_fields",
        message: "One or more required fields are missing.",
      };
    }
    fanId = Math.abs(parseInt(fanId, 10));
    creatorId = Math.abs(parseInt(creatorId, 10));

    bookingDate = sanitizeTextField(bookingDate);
    bookingStart = sanitizeTextField(bookingStart);
    bookingEnd = sanitizeTextField(bookingEnd);

    baseCharge = parseFloat(baseCharge);

    negotiationPhase = negotiationPhase ? Boolean(negotiationPhase) : false;

    initialTokenCharge = Array.isArray(initialTokenCharge)
      ? initialTokenCharge.map(sanitizeTextField)
      : [];

    try {
      const bookingCreated = await this.createBooking({
        fanId,
        creatorId,
        bookingDate,
        bookingStart,
        bookingEnd,
        baseCharge,
        negotiationPhase,
        initialTokenCharge,
      });

      // Check if booking creation failed
      if (!bookingCreated || bookingCreated instanceof Error) {
        return bookingCreated;
      }
    } catch (e) {
      console.error("Error in handleCreateBooking:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while creating the booking.",
      };
    }
    return true;
  }

  // NOT TESTED
  // NOT WORKING
  static async handleNoShow(bookingId, userType) {
    if (!bookingId || !["fan", "creator", "both"].includes(userType)) {
      return false;
    }
    bookingId = String(Math.abs(parseInt(bookingId, 10)));
    userType = sanitizeTextField(userType);

    const tableName = "fs_bookings";
    try {
      const booking = await ScyllaDb.getItem(tableName, {
        booking_ID: bookingId,
      });

      // const updateResult = await ScyllaDb.updateItem(
      //   tableName,
      //   { booking_ID: bookingId, user_ID: booking[0].user_ID }, // primary key
      //   {
      //     ready_state_time: readyTime,
      //     ready_by: userType.trim().toLowerCase(),
      //   }
      // );

      if (!booking) {
        return false;
      }
      const creatorId = Math.abs(parseInt(booking.creator_id, 10));
      const bookingStartTime = booking.booking_start_time
        ? DateTime.parseDateToTimestamp(booking.booking_start_time) / 1000
        : null;
      const readyStateTime = booking.ready_state_time
        ? DateTime.parseDateToTimestamp(booking.ready_state_time) / 1000
        : null;

      // Simple input sanitization for 'ready_by'
      const readyBy = sanitizeTextField(booking.ready_by);
      const calculateMissedBookingTime =
        readyStateTime > bookingStartTime - 300;

      let registerMissedBooking;
      if (readyStateTime || calculateMissedBookingTime) {
        if (readyBy === "creator" || readyBy === "both") {
          registerMissedBooking = await this.registerMissedBooking(
            bookingId,
            "creator"
          );
          console.log("first if", registerMissedBooking);
        } else if (readyBy === "fan" || readyBy === "both") {
          registerMissedBooking = await this.registerMissedBooking(
            bookingId,
            "fan"
          );
          console.log("second if", registerMissedBooking);
        }
        console.log("registerMissedBooking", registerMissedBooking);
        return registerMissedBooking;
      }
      return false;
    } catch (e) {
      console.error("Error in handleNoShow:", e);
      return {
        error: "internal_error",
        message: "An internal error occurred while handling no-show.",
      };
    }
  }

  static async handleCreatorSuspesnion(createrId) {
    if (!createrId) {
      return false;
    }

    try {
      createrId = Math.abs(parseInt(createrId, 10));
      const userSettings = await Users.getUserFields(createrId, [
        "no_show_count",
      ]);

      if (userSettings["no_show_count"] >= 3) {
        return await this.applyMissedBookingSuspension(createrId);
      }
      return false;
    } catch (e) {
      console.error("Error in handleCreatorSuspesnion:", e);
      return {
        error: "internal_error",
        message:
          "An internal error occurred while handling creator suspension.",
      };
    }
  }
}

//wordpress utils
function sanitizeTextField(input) {
  if (typeof input !== "string") return "";

  return input
    .replace(/[\u0000-\u001F\u007F]/g, "") // Remove control characters
    .replace(/<\/?[^>]+(>|$)/g, "") // Remove HTML tags
    .replace(/\r|\n/g, "") // Remove newlines
    .trim(); // Trim leading/trailing whitespace
}

class Tokens {
  static releaseDepositTokens(bookingId) {
    //pretend tokens were returned
  }
  static getUserTokensBalance(userId) {
    //TODO: implement actual logic to fetch user token balance
    return 10000;
  }

  static getTokenPrice() {
    //TODO: implement actual logic to get token price
    return 1;
  }
}

export class Users {
  static users = {};
  static async createUser(user) {
    console.log("------creating user", user);
    this.users[user.user_ID] = user;
  }
  static async getUserById(userId) {
    console.log("users are:", this.users);
    return this.users[userId] || false;
  }

  static getUserDisplayName(userId) {
    return "John Doe";
  }
  static async getUserFields(userId, fields = []) {
    if (!userId || !Array.isArray(fields)) {
      throw new Error("Invalid parameters");
    }
    userId = String(userId);

    // Fetch the user item
    let user;
    try {
      user = this.getUserById(userId);
    } catch (e) {
      throw new Error(`Error fetching user: ${e.message}`);
    }

    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    // Filter and return only the requested fields
    const result = {};
    for (const field of fields) {
      if (
        field === "booking_settings" &&
        typeof user.booking_settings === "object"
      ) {
        result.booking_settings = JSON.stringify(user.booking_settings);
      } else if (field in user) {
        result[field] = user[field];
      }
    }

    return result;
  }

  static async updateUserFields(userId, role, fields) {
    // Ensure role is "creator"
    if (role !== "creator") {
      return false;
    }

    // Normalize userId to string format expected in DB
    const userKey = `${parseInt(userId)}`;

    // Fetch existing record
    let existing;
    try {
      existing = await this.getUserById(userKey);
    } catch (e) {
      console.error("Error fetching existing user:", e);
      return false;
    }
    if (!existing) {
      return false;
    }

    // Merge updated fields with existing item
    const updatedItem = {
      ...existing,
      ...fields,
    };

    this.users[userKey] = updatedItem; // Update in memory

    // Save updated item
    return true;
  }

  static async getUserRole(userId) {
    userId = String(userId);

    const user = await this.getUserById(userId);
    if (!user) return false;

    return user?.role;
  }
}

class Utilities {
  static async setCreatorTimeZone(creatorId) {
    if (!creatorId) {
      return {
        error: "invalid_creator_id",
        message: "Creator ID is missing or invalid",
      };
    }

    // Return mock timezone (instead of actually looking it up)
    const timezone = "Africa/Addis_Ababa";

    // console.log(`Mock timezone '${timezone}' set for creator ${creatorId}`);

    return timezone;
  }
}

async function sendEmail(recipientEmail, subject, body, headers = []) {
  console.log("Sending email...");
  console.log("To:", recipientEmail);
  console.log("Subject:", subject);
  console.log("Body:", body);
  console.log("Headers:", headers);
  console.log("Email sent (dummy).");
  return true;
}

export class Notification {
  static async addNotification(args) {
    console.log("[Notification Added]", {
      userId: args.user_id,
      notice: args.notice,
      type: args.type,
      priority: args.priority,
      flag: args.flag,
      icon: args.icon,
    });

    // Simulate success
    return true;
  }
}
