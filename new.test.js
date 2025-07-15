import BookingsManager, { Users } from "./BookingsManager.js";
import ScyllaDb from "./scylla/ScyllaDb.js";

beforeAll(async () => {
  await ScyllaDb.configure({
    endpoint: "http://localhost:8000/",
    region: "us-east-1",
    key: "test",
    secret: "test",
    enableCache: false,
  });

  await ScyllaDb.loadTableConfigs("./scylla/config/tables.json");

  await Users.createUser({
    email: "john@gmail.com",
    user_ID: "123",
    role: "creator",
  });

  await ScyllaDb.putItem("fs_booking_settings", {
    id: "123",
    activity_status: "active",
    no_show_count: 0,
    timezone: "Africa/Addis_Ababa",
    min_charge: 10,
    after_hours: { start: "22:00:00", end: "06:00:00" },
    suspensions: [
      { start_date: "2025-07-10", end_date: "2025-07-15", status: "active", no_shows_booking_ids: ["123", "456"] },
      { start_date: "2025-08-01", end_date: "2025-08-03", status: "inactive" },
    ],
    booking_buffer: 15,
    advance_booking: true,
    instant_booking: false,
    max_booking_time: 60,
    min_booking_time: 15,
    negotiation_phase: false,
    after_hour_surcharge: false,
    default_working_hours: { start: "09:00:00", end: "17:00:00" },
    booking_window_in_minutes: 1440,
    after_hour_token_price_per_minute: 2,
    default_working_hour_token_price_per_minute: 1,
  });
});

describe("BookingsManager Core Tests", () => {
  const creatorId = "123";
  const fanId = "12345";

  test("getRollingWorkWindows returns expected result", () => {
    const result = BookingsManager.getRollingWorkWindows({
      default_working_hours: { start: "08:00", end: "00:00" },
      after_hours: { start: "00:00", end: "03:00" },
    });

    expect(result).toEqual([
      { start: "00:00", end: "03:00" },
      { start: "08:00", end: "00:00" },
    ]);
  });

  test("resolveEffectiveHours returns merged intervals", () => {
    const result = BookingsManager.resolveEffectiveHours({
      default_working_hours: { start: "08:00", end: "16:00" },
      after_hours: { start: "23:00", end: "01:00" },
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  test("isUserExistsAndValid returns true", async () => {
    const exists = await BookingsManager.isUserExistsAndValid(creatorId);
    expect(exists).toBe(true);
  });

  test("getCreatorBookingSettings returns settings with max_booking_time", async () => {
    const settings = await BookingsManager.getCreatorBookingSettings(creatorId);
    expect(settings.max_booking_time).toBe(60);
  });

  test("booking suspension detection", async () => {
    const suspended = await BookingsManager.isCreatorBookingSuspended(creatorId, "2025-07-12", {
      suspensions: [
        { start_date: "2025-07-10", end_date: "2025-07-15", status: "active", no_shows_booking_ids: ["booking#123"] },
      ],
    });
    expect(suspended).toEqual(expect.objectContaining({ error: "suspensions_found" }));

    const notSuspended = await BookingsManager.isCreatorBookingSuspended(creatorId, "2026-07-12", {
      suspensions: [],
    });
    expect(notSuspended).toBe("not_suspended");
  });

  test("validateBookingDuration returns false for too short", async () => {
    const result = await BookingsManager.validateBookingDuration(
      creatorId,
      "2025-07-01T20:00:00",
      "2025-07-01T21:00:00",
      { min_booking_time: 100, max_booking_time: 999 }
    );
    expect(result).toEqual(expect.objectContaining({ error: "invalid_booking_duration" }));
  });

  test("validateBookingDuration returns true for valid range", async () => {
    const result = await BookingsManager.validateBookingDuration(
      creatorId,
      "2025-07-01T20:00:00",
      "2025-07-01T21:00:00",
      { min_booking_time: 10, max_booking_time: 999 }
    );
    expect(result).toBe(true);
  });

  test("isBookingWithinOfflineHours returns correct booleans", async () => {
    const good = await BookingsManager.isBookingWithinOfflineHours(creatorId, "20:00:00", "21:00:00", "2025-07-01", {
      default_working_hours: { start: "08:00:00", end: "10:00:00" },
      after_hours: { start: "20:00:00", end: "21:00:00" },
    });
    expect(good).toBe(true);

    const bad = await BookingsManager.isBookingWithinOfflineHours(creatorId, "07:30:00", "12:30:00", "2025-07-01", {
      default_working_hours: { start: "08:00:00", end: "10:00:00" },
      after_hours: { start: "20:00:00", end: "21:00:00" },
    });
    expect(bad).toEqual(expect.objectContaining({ error: "booking_within_offline_hours" }));
  });

  test("getMinimumBookingTime and getMaximumBookingTime return integers", async () => {
    const min = await BookingsManager.getMinimumBookingTime(creatorId);
    const max = await BookingsManager.getMaximumBookingTime(creatorId);
    expect(typeof min).toBe("number");
    expect(typeof max).toBe("number");
  });

  test("hasModelEnabledBooking and Negotiation return booleans", async () => {
    const booking = await BookingsManager.hasModelEnabledBooking(creatorId);
    const negotiation = await BookingsManager.hasModelEnabledNegotiation(creatorId);
    expect(typeof booking).toBe("boolean");
    expect(typeof negotiation).toBe("boolean");
  });
  test("handleCreateBooking returns boolean", async () => {
    const result = await BookingsManager.handleCreateBooking(
      fanId,
      creatorId,
      "2025-07-05",
      "10:01:00",
      "15:00:00",
      10.0,
      false,
      [
        { type: "token", amount: "10" },
        { type: "fee", amount: "2" },
      ]
    );
    expect(typeof result).toBe("boolean");
  });

  test("addBookingSuspensionPeriod returns boolean", async () => {
    const result = await BookingsManager.addBookingSuspensionPeriod(
      creatorId,
      "2025-07-10",
      "2025-07-15",
      "active"
    );
    expect(typeof result).toBe("boolean");
  });
  test("applyMissedBookingSuspension returns boolean", async () => {
    const result = await BookingsManager.applyMissedBookingSuspension(creatorId);
    expect(typeof result).toBe("boolean");
  });

  test("handleCreatorSuspension returns boolean", async () => {
    const result = await BookingsManager.handleCreatorSuspesnion(creatorId);
    expect(typeof result).toBe("boolean");
  });

  // test("handleNoShow returns boolean", async () => {
  //   const details = await BookingsManager.getCreatorsBookings(creatorId);
  //   const anyBookingId = details[0]?.booking_ID;
  //   if (anyBookingId) {
  //     const result = await BookingsManager.handleNoShow(anyBookingId, "fan");
  //     expect(typeof result).toBe("boolean");
  //   } else {
  //     expect(true).toBe(true); 
  //   }
  // });
  test("isRequestedTimeAvailable returns false when time is unavailable", async () => {
  const result = await BookingsManager.isRequestedTimeAvailable(
    creatorId,
    "2025-07-01 08:00:00",
    "2025-07-01 09:00:00"
  );
  expect(result).toBe(false);
});
  test("isRequestedTimeAvailable returns true when time is available", async () => {
    const result = await BookingsManager.isRequestedTimeAvailable(
      creatorId,
      "2025-07-01 10:00:00",
      "2025-07-01 11:00:00"
    );
    expect(result).toBe(true);
  });

  test("isRequestedTimeAvailable returns true when time is available", async () => {
    const result = await BookingsManager.isRequestedTimeAvailable(
      creatorId,
      "2024-07-01 10:00:00",
      "2023-07-01 11:00:00"
    );
    expect(result).toBe(false);
  });
});
