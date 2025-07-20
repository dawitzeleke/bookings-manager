// test.js
import BookingsManager, { Users } from "./BookingsManager.js";
import ScyllaDb from "./scylla/ScyllaDb.js";

// // Configure ScyllaDB
// ScyllaDb.configure({
//   endpoint: "http://localhost:8000/",
//   region: "us-east-1",
//   key: "test",
//   secret: "test",
//   enableCache: false,
// });

// Instance of BookingsManager
const manager = new BookingsManager();

async function createCreatorUser(id) {
  await Users.createUser({
    email: "john@gmail.com",
    user_ID: id,
    role: "creator",
  });

  await ScyllaDb.putItem("fs_booking_settings", {
    id: id,
    activity_status: "active",
    no_show_count: 0,
    timezone: "Africa/Addis_Ababa",
    min_charge: 10,
    after_hours: {
      start: "22:00:00",
      end: "06:00:00",
    },
    suspensions: [
      {
        start_date: "2025-07-10",
        end_date: "2025-07-15",
        status: "active",
        no_shows_booking_ids: ["123", "456"],
      },
      {
        start_date: "2025-08-01",
        end_date: "2025-08-03",
        status: "inactive",
      },
    ],
    booking_buffer: 15,
    advance_booking: true,
    instant_booking: false,
    max_booking_time: 60,
    min_booking_time: 15,
    negotiation_phase: false,
    after_hour_surcharge: false,
    default_working_hours: {
      start: "09:00:00",
      end: "17:00:00",
    },
    booking_window_in_minutes: 1440,
    after_hour_token_price_per_minute: 2,
    default_working_hour_token_price_per_minute: 1,
  });
}

// Run tests

// Run tests
async function runTests() {
  // Load table config (adjust path if needed)
  await ScyllaDb.loadTableConfigs("./scylla/config/tables.json");

  const creatorId = "789"; // Change to match test data

  try {
    console.log("🧪 ...");
    console.log(
      "getRollingWorkWindows() result:",
      BookingsManager.getRollingWorkWindows({
        default_working_hours: { start: "08:00", end: "00:00" },
        after_hours: { start: "00:00", end: "03:00" },
      })
    );

    console.log(
      "resolveEffectiveHours() result:",
      BookingsManager.resolveEffectiveHours({
        default_working_hours: { start: "08:00", end: "16:00" },
        after_hours: { start: "23:00", end: "01:00" },
      })
    );

    const creatorId = "123";
    await createCreatorUser(creatorId);
    console.log(
      "user exists",
      await BookingsManager.isUserExistsAndValid(creatorId)
    );

    console.log(
      "user settings",
      Object.values(
        await BookingsManager.getCreatorBookingSettings(creatorId)
      ).slice(0, 3)
    );

    console.log(
      "should be suspended:",
      await BookingsManager.isCreatorBookingSuspended(creatorId, "2025-07-12", {
        suspensions: [
          {
            start_date: "2025-07-10",
            end_date: "2025-07-15",
            status: "active",
            no_shows_booking_ids: ["booking#123", "booking#456"],
          },
          {
            start_date: "2025-08-01",
            end_date: "2025-08-03",
            status: "inactive",
          },
        ],
      })
    );

    console.log(
      "should not be suspended:",
      await BookingsManager.isCreatorBookingSuspended(creatorId, "2026-07-12", {
        suspensions: [
          {
            start_date: "2025-07-10",
            end_date: "2025-07-15",
            status: "active",
            no_shows_booking_ids: ["booking#123", "booking#456"],
          },
          {
            start_date: "2025-08-01",
            end_date: "2025-08-03",
            status: "inactive",
          },
        ],
      })
    );

    console.log(
      "time range should be invalid:",
      await BookingsManager.validateBookingDuration(
        creatorId,
        "2025-07-01T20:00:00",
        "2025-07-01T21:00:00",
        { min_booking_time: 100, max_booking_time: 999 }
      )
    );

    console.log(
      "time range should be true:",
      await BookingsManager.validateBookingDuration(
        creatorId,
        "2025-07-01T20:00:00",
        "2025-07-01T21:00:00",
        { min_booking_time: 10, max_booking_time: 999 }
      )
    );

    console.log(
      "should be in good hours",
      await BookingsManager.isBookingWithinOfflineHours(
        creatorId,
        "20:00:00",
        "21:00:00",
        "2025-07-01",
        {
          default_working_hours: { start: "08:00:00", end: "10:00:00" },
          after_hours: { start: "20:00:00", end: "21:00:00" },
        }
      )
    );

    console.log(
      "should be in bad hours",
      await BookingsManager.isBookingWithinOfflineHours(
        creatorId,
        "07:30:00",
        "12:30:00",
        "2025-07-01",
        {
          default_working_hours: { start: "08:00:00", end: "10:00:00" },
          after_hours: { start: "20:00:00", end: "21:00:00" },
        }
      )
    );

    console.log(
      "should not be available",
      await BookingsManager.isRequestedTimeAvailable(
        creatorId,
        "2025-07-01 08:00:00",
        "2025-07-01 09:00:00"
      )
    );

    console.log(
      "should not be available even via recurrence:",
      await BookingsManager.isRequestedTimeAvailable(
        creatorId,
        "2099-07-01 08:00:00",
        "2099-07-01 09:00:00",
        "FREQ=YEARLY;COUNT=2"
      )
    );

    console.log(
      "should be available",
      await BookingsManager.isRequestedTimeAvailable(
        creatorId,
        "2027-07-01 09:00:00",
        "2027-07-01 10:00:00"
      )
    );

    console.log(
      "should be available via recurrence:",
      await BookingsManager.isRequestedTimeAvailable(
        creatorId,
        "2099-07-01 09:00:00",
        "2099-07-01 10:00:00",
        "FREQ=YEARLY;COUNT=2"
      )
    );

    const userId = "12345";
    console.log(
      "create user",
      await Users.createUser({
        user_ID: userId,
        email: "doe@gmail.com",
        role: "fan",
      }),
      await ScyllaDb.putItem("fs_booking_settings", {
        id: userId,
        role: "fan",
        activity_status: "active",
        no_show_count: 2,
      })
    );

    console.log(
      "create booking",
      await BookingsManager.createBooking(
        userId, // fanId
        creatorId, // creatorId
        "2025-07-05", // bookingDate
        "10:01:00", // bookingStart
        "10:19:00", // bookingEnd
        10.0, // baseCharge
        false, // negotiationPhase
        [
          // initialTokenCharge
          { type: "token", amount: "10" },
          { type: "fee", amount: "2" },
        ],
        "FREQ=YEARLY;COUNT=2"
      )
    );

    console.log(
      "update settings should be 61:",
      await BookingsManager.updateBookingSettings(creatorId, {
        max_booking_time: 61,
      }),
      (await BookingsManager.getCreatorBookingSettings(creatorId))
        .max_booking_time
    );

    const bookingId = await BookingsManager.createBooking(
      userId, // fanId
      creatorId, // creatorId
      "2025-07-06", // bookingDate
      "10:01:00", // bookingStart
      "10:55:00", // bookingEnd
      10.0, // baseCharge
      false, // negotiationPhase
      [
        // initialTokenCharge
        { type: "token", amount: "10" },
        { type: "fee", amount: "2" },
      ],
      "FREQ=YEARLY;COUNT=2"
    );
    console.log(
      "should get status:",
      await BookingsManager.getBookingStatus(bookingId)
    );
    console.log(
      "should have recurring rule:",
      (await BookingsManager.getBookingDetails(bookingId)).recurrenceRule
    );

    console.log(
      "should be confirmed",
      await BookingsManager.updateBookingStatus(bookingId, "confirmed"),
      await BookingsManager.getBookingStatus(bookingId)
    );

    console.log("should exist", await BookingsManager.bookingExists(bookingId));

    console.log(
      "should be pending",
      await BookingsManager.setBookingStatus(bookingId, "pending"),
      await BookingsManager.getBookingStatus(bookingId)
    );

    console.log(
      "should be many bookings ",
      (await BookingsManager.getUpcomingBookings(creatorId, 500000000)).length
    );
    const oldReccurenceBookId = await BookingsManager.createBooking(
      userId,
      creatorId,
      "2000-07-05",
      "12:01:00",
      "12:33:00",
      10.0,
      false,
      [
        { type: "token", amount: "10" },
        { type: "fee", amount: "2" },
      ],
      "FREQ=YEARLY;COUNT=30"
    );

    const farFutureBookId = await BookingsManager.createBooking(
      userId,
      creatorId,
      "3000-07-05",
      "11:01:00",
      "11:33:00",
      10.0,
      false,
      [
        { type: "token", amount: "10" },
        { type: "fee", amount: "2" },
      ],
      "FREQ=YEARLY;COUNT=30"
    );

    console.log(
      "upcoming should include oldRecurrenceBookId:",
      (await BookingsManager.getUpcomingBookings(creatorId, 5000000)).filter(
        (b) => b.booking_ID === oldReccurenceBookId
      )
    );

    console.log(
      "upcoming should not include far future recurrence rule:",
      (await BookingsManager.getUpcomingBookings(creatorId, 5000000)).filter(
        (b) => b.booking_ID === farFutureBookId
      )
    );

    console.log(
      "should get booking details.id",
      (await BookingsManager.getBookingDetails(bookingId)).booking_ID
    );

    //TODO: check for positive cases
    console.log(
      "should be empty",
      await BookingsManager.getUpcomingBookingSessions(creatorId)
    );
    console.log(
      "should have ready by:",
      await BookingsManager.registerReadyState(bookingId, "creator"),
      (await BookingsManager.getBookingDetails(bookingId)).ready_by
    );

    console.log(
      "should be creatorId:",
      await BookingsManager.getUserIdFromBooking(bookingId, "creator")
    );

    console.log(
      "should have missed by=fan:",
      await BookingsManager.registerMissedBooking(bookingId, "fan"),
      (await BookingsManager.getBookingDetails(bookingId)).missed_by
    );

    console.log(
      "should have missed >=1:",
      await BookingsManager.registerMissedBooking(bookingId, "creator"),
      await BookingsManager.countMissedBooking(creatorId),
      (await ScyllaDb.getItem("fs_booking_settings", { id: creatorId }))
        .no_show_count
    );

    console.log(
      "should have 0 no_show_count:",
      await BookingsManager.resetNoShowCountAndLiftSuspension(creatorId),
      (await ScyllaDb.getItem("fs_booking_settings", { id: creatorId }))
        .no_show_count
    );

    console.log(
      "should include a suspension in 2025-07-10:",
      (await ScyllaDb.getItem("fs_booking_settings", { id: creatorId }))
        .suspensions,
      //
      "then should not include a suspension in 2025-07-10:",
      await BookingsManager.revokeBookingSuspension(creatorId, "2025-07-10"),
      (await ScyllaDb.getItem("fs_booking_settings", { id: creatorId }))
        .suspensions
    );

    console.log(
      "should be rescheduled to 2026:",
      await BookingsManager.rescheduleBooking(
        creatorId,
        bookingId,
        "full",
        "2026-07-01",
        "10:00:00"
      ),
      (await BookingsManager.getBookingDetails(bookingId)).startTime
    );

    console.log(
      "should be rescheduled to 11:00:00:",
      await BookingsManager.rescheduleBooking(
        creatorId,
        bookingId,
        "partial",
        null,
        "11:00:00"
      ),
      (await BookingsManager.getBookingDetails(bookingId)).startTime
    );

    console.log(
      "reschedule request should be appended",
      await BookingsManager.requestRescheduleBooking(
        creatorId,
        bookingId,
        50.5
      ),
      (await BookingsManager.getBookingDetails(bookingId)).auditTrail.filter(
        (item) => item.action === "request_reschedule"
      )
    );

    console.log(
      "reschedule should have a status",
      await BookingsManager.acceptRescheduleBooking(bookingId),
      (await BookingsManager.getBookingDetails(bookingId)).status
    );

    console.log(
      "decline should have a status",
      await BookingsManager.declineRescheduleBooking(
        creatorId,
        bookingId,
        "cant book now"
      ),
      (await BookingsManager.getBookingDetails(bookingId)).status
    );

    console.log(
      "should be email body",

      BookingsManager.getEmailBody(
        await BookingsManager.getBookingDetails(bookingId),
        "fan",
        "booking_confirmed"
      )
    );

    console.log(
      "should print email sent",
      await BookingsManager.sendNotificationEmail(
        await BookingsManager.getBookingDetails(bookingId),
        "fan",
        "booking_confirmed"
      )
    );

    console.log(
      "should print notification saying booking confirmed successfully:",

      await BookingsManager.addNotificationBookingStatus({
        user_id: userId,
        notice: "Booking confirmed successfully",
      })
    );

    console.log(
      "should print notification saying booking confirmed successfully:",
      await BookingsManager.addNotificationBookingStatus({
        user_id: userId,
        notice: "Booking confirmed successfully",
      })
    );

    console.log(
      "should print email:",
      await BookingsManager.notifyBookingStatusChange(
        bookingId,
        "success_booking"
      )
    );

    console.log(
      "get creator bookings >= 1",
      (await BookingsManager.getCreatorsBookings(creatorId)).length
    );

    console.log(
      "should have an admin note",
      await BookingsManager.addAdminNote(bookingId, "first note"),
      (await BookingsManager.getBookingDetails(bookingId)).adminNotes
    );

    console.log(
      "should have an edited note:",
      await BookingsManager.editAdminNotes(bookingId, 0, "first note [edited]"),
      (await BookingsManager.getBookingDetails(bookingId)).adminNotes
    );

    console.log(
      "should show ten types of auditTrail actions:",
      (await BookingsManager.getBookingDetails(bookingId)).auditTrail.map(
        (trial) => trial.action
      )
    );

    // console.log("\n🧪 Testing getRollingWorkWindows...");
    // const windows = await manager.getRollingWorkWindows(creatorId, 3);
    // console.log("✅ Working Windows:", windows);
    // console.log("\n🧪 Testing resolveEffectiveHours...");
    // const effective = await manager.resolveEffectiveHours(
    //   creatorId,
    //   "2025-07-01"
    // );
    // console.log("✅ Effective Hours:", effective);
    // console.log("\n🧪 Testing isTimeSlotFree...");
    // const free = await manager.isTimeSlotFree(
    //   `creator#${creatorId}`,
    //   "2025-07-01T20:00:00",
    //   "2025-07-01T21:00:00"
    // );
    // console.log("✅ Time Slot Free:", free);
    // console.log("\n🧪 Testing validateBookingDuration...");
    // const valid = await manager.validateBookingDuration(30, creatorId);
    // console.log("✅ Duration Valid:", valid);
    // console.log("\n🧪 Testing isTimeSpanOverMidnight...");
    // const crosses = manager.isTimeSpanOverMidnight(
    //   "2025-07-01T23:30:00",
    //   "2025-07-02T00:30:00"
    // );
    // console.log("✅ Crosses Midnight:", crosses);\
    console.log(
      "should return boolean",
      await BookingsManager.handleCreateBooking(
        userId, // fanId
        creatorId, // creatorId
        "2025-07-05", // bookingDate
        "10:01:00", // bookingStart
        "15:00:00", // bookingEnd
        10.0, // baseCharge
        false, // negotiationPhase
        [
          // initialTokenCharge
          { type: "token", amount: "10" },
          { type: "fee", amount: "2" },
        ]
      )
    );
    console.log(
      "should return boolean",
      await BookingsManager.addBookingSuspensionPeriod(
        creatorId,
        "2025-07-10",
        "2025-07-15",
        "active"
      )
    );

    console.log(
      "should return boolean",
      await BookingsManager.applyMissedBookingSuspension(creatorId)
    );

    console.log(
      "should return boolean",
      await BookingsManager.handleCreatorSuspesnion(creatorId)
    );

    console.log(
      "should return boolean",
      await BookingsManager.handleNoShow(bookingId, "fan")
    );
    console.log(
      "should return boolean",
      await BookingsManager.handleCreateBooking(
        userId, // fanId
        creatorId, // creatorId
        "2025-07-05", // bookingDate
        "10:01:00", // bookingStart
        "15:00:00", // bookingEnd
        10.0, // baseCharge
        false, // negotiationPhase
        [
          // initialTokenCharge
          { type: "token", amount: "10" },
          { type: "fee", amount: "2" },
        ]
      )
    );
    console.log(
      "should return boolean or an integer",
      await BookingsManager.getMaximumBookingTime(creatorId)
    );
    console.log(
      "should return boolean or an integer",
      await BookingsManager.getMinimumBookingTime(creatorId)
    );
    console.log(
      "should return boolean or an integer",
      await BookingsManager.getBookingBufferTime(creatorId)
    );
    console.log(
      "should return boolean",
      await BookingsManager.hasModelEnabledNegotiation(creatorId)
    );

    console.log(
      "should return boolean",
      await BookingsManager.hasModelEnabledBooking(creatorId)
    );

    console.log(
      "should return array or boolean",
      await BookingsManager.calculateTimeSlots(
        creatorId,
        "2025-07-01 00:01:00",
        "2025-07-01 23:59:00",
        [
          {
            userId: "user#123",
            bookingId: "booking#456",
            creatorId: "creator#789",
            startTime: "2025-07-01 21:00:00",
            endTime: "2025-07-01 22:00:00",
            timezone: "Australia/Brisbane",
            status: "confirmed", // or cancelled, missed, etc.
            isRecurring: true,
            recurrenceRule: "FREQ=WEEKLY;BYDAY=TU",
            notificationsEnabled: {
              fan: {
                reminder: true,
                update: false,
              },
              creator: {
                reminder: true,
                update: true,
              },
            },
            adminNotes: "Initial booking via chat",
            calendarSync: {
              google: true,
              iCalExported: false,
            },
            createdAt: "2025-06-27 15:00:00",
            createdByIp: "123.123.123.123",
            auditTrail: [
              {
                timestamp: "2025-06-27 15:00:00",
                action: "created",
                actor: "user#123",
              },
            ],
          },
        ],
        15 // buffer in minutes
      )
    );
    return;
  } catch (err) {
    console.error("❌ Test failed:", err);
  }
}

runTests();
