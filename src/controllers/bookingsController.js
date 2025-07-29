import {
  bookingExists,
  calculatePrice,
  createBooking,
  doesAppointmentCrossOver,
  getBookingDetails,
  getBookingStatus,
  getCreatorBookings,
  getCreatorBookingSettings,
  getOfflineHours,
  getRollingWorkWindows,
  getUpcomingBookings,
  getUpcomingBookingSessions,
  getUserBookingJson,
  getUserIdFromBooking,
  isBookingWithinOfflineHours,
  isCreatorBookingSuspended,
  isRequestedTimeAvailable,
  isUserExistsAndValid,
  registerReadyState,
  resolveEffectiveHours,
  setBookingStatus,
  updateBookingSettings,
  updateBookingStatus,
  validateBookingDuration,
} from "../services/bookingsService.js";

export async function handleGetRollingWorkWindows(req, res) {
  try {
    const result = await getRollingWorkWindows(req.body.bookingSettings);
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetResolveEffectiveHours(req, res) {
  try {
    // Assuming you have a service function for resolving effective hours
    const result = await resolveEffectiveHours(req.body.bookingSettings);
    res.json(result);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetIsUserExistsAndValid(req, res) {
  try {
    const userId = req.query.userId; // Assuming userId is passed as a query parameter
    const isValid = await isUserExistsAndValid(userId);
    res.json({ isValid });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetgetCreatorBookingSettings(req, res) {
  try {
    const creatorId = req.query.creatorId; // Assuming creatorId is passed as a query parameter
    const bookingSettings = await getCreatorBookingSettings(creatorId);
    res.json(bookingSettings);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetCreatorBookings(req, res) {
  try {
    const creatorId = req.query.creatorId; // Assuming creatorId is passed as a query parameter
    const bookingSettings = await getCreatorBookings(creatorId);
    res.json(bookingSettings);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetIsCreatorBookingSuspended(req, res) {
  try {
    const creatorId = req.query.creatorId; // Assuming creatorId is passed as a query parameter
    const date = req.query.date; // Assuming date is passed as a query parameter
    const bookingSettings = req.body.bookingSettings; // Assuming bookingSettings is passed in the request body

    const isSuspended = await isCreatorBookingSuspended(
      creatorId,
      date,
      bookingSettings
    );
    res.json({ isSuspended });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleValidateBookingDuration(req, res) {
  try {
    const creatorId = req.query.creatorId; // Assuming creatorId is passed as a query parameter
    const bookingStart = req.body.bookingStart; // Assuming bookingStart is passed in the request body
    const bookingEnd = req.body.bookingEnd; // Assuming bookingEnd is passed in the request body
    const bookingSettings = req.body.bookingSettings; // Assuming bookingSettings is passed in the request body

    const isValid = await validateBookingDuration(
      creatorId,
      bookingStart,
      bookingEnd,
      bookingSettings
    );
    res.json({ isValid });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetOfflineHours(req, res) {
  try {
    const bookingSettings = req.body.bookingSettings; // Assuming bookingSettings is passed in the request body
    const offlineHours = await getOfflineHours(bookingSettings);
    res.json(offlineHours);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleIsBookingWithinOfflineHours(req, res) {
  try {
    const creatorId = req.query.creatorId; // Assuming creatorId is passed as a query parameter
    const bookingStartTime = req.body.bookingStartTime; // Assuming bookingStartTime is passed in the request body
    const bookingEndTime = req.body.bookingEndTime; // Assuming bookingEndTime is passed in the request body
    const date = req.body.date; // Assuming date is passed as a query parameter
    const bookingSettings = req.body.bookingSettings; // Assuming bookingSettings is passed in the request body

    const isWithinOfflineHours = await isBookingWithinOfflineHours(
      creatorId,
      bookingStartTime,
      bookingEndTime,
      date,
      bookingSettings
    );
    res.json({ isWithinOfflineHours });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleCreateBooking(req, res) {
  const {
    fanId,
    creatorId,
    bookingDate,
    bookingStart,
    bookingEnd,
    baseCharge,
    negotiationPhase = false,
    initialTokenCharge = [],
    recurrenceRule = null,
  } = req.body;

  try {
    const booking = await createBooking(
      fanId,
      creatorId,
      bookingDate,
      bookingStart,
      bookingEnd,
      baseCharge,
      negotiationPhase,
      initialTokenCharge,
      recurrenceRule
    );
    res.status(201).json(booking);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

// Not tested this one on
export async function handleCalculatePrice(req, res) {
  try {
    const {
      creatorId,
      appointmentStart,
      appointmentEnd,
      date,
      defaultTokenPerMinute,
      surchargeTokenPerMinute,
      bookingSettings,
    } = req.body;

    const price = await calculatePrice(
      creatorId,
      appointmentStart,
      appointmentEnd,
      date,
      defaultTokenPerMinute,
      surchargeTokenPerMinute,
      bookingSettings
    );
    res.json({ price });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleDoesAppointmentCrossOver(req, res) {
  try {
    const {
      creatorId,
      appointmentStart,
      appointmentEnd,
      date,
      bookingSettings,
    } = req.body;

    // Assuming you have a service function to check for appointment crossover
    const doesCrossOver = await doesAppointmentCrossOver(
      creatorId,
      appointmentStart,
      appointmentEnd,
      date,
      bookingSettings
    );
    res.json({ doesCrossOver });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleIsRequestedTimeAvailable(req, res) {
  try {
    const { creatorId, requestedStart, requestedEnd, recurrenceRule } =
      req.body;

    // Assuming you have a service function to check if the requested time is available
    const isAvailable = await isRequestedTimeAvailable(
      creatorId,
      requestedStart,
      requestedEnd,
      recurrenceRule
    );
    res.json({ isAvailable });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetUserBookingJson(req, res) {
  const { creatorId, bookingSettings } = req.body;
  try {
    const userBookingJson = await getUserBookingJson(
      creatorId,
      bookingSettings
    );
    res.json(userBookingJson);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleUpdateBookingSettings(req, res) {
  const { userId, settingsObject, options } = req.body;
  try {
    const updatedSettings = await updateBookingSettings(
      userId,
      settingsObject,
      options
    );
    res.json(updatedSettings);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

// not done
// export async function handleValidateAndSanitizeBookingSettings(req, res){

// }

export async function handleGetUserIdFromBooking(req, res) {
  const { bookingId, role } = req.body;
  try {
    const userId = await getUserIdFromBooking(bookingId, role);
    res.json({ userId });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetBookingStatus(req, res) {
  const { bookingId } = req.query; // Assuming bookingId is passed as a query parameter
  try {
    const bookingStatus = await getBookingStatus(bookingId);
    res.json({ bookingStatus });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleUpdateBookingStatus(req, res) {
  const { bookingId, status } = req.body; // Assuming bookingId and status are passed in the request body
  try {
    const updatedStatus = await updateBookingStatus(bookingId, status);
    res.json(updatedStatus);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleBookingExists(req, res) {
  const { bookingId } = req.body; // Assuming bookingId is passed as a query parameter
  try {
    const exists = await bookingExists(bookingId);
    res.json({ exists: !!exists });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleSetBookingStatus(req, res) {
  const { bookingId, status } = req.body; // Assuming bookingId and status are passed in the request body
  try {
    const updatedStatus = await setBookingStatus(bookingId, { status });
    res.json(updatedStatus);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetUpcomingBookings(req, res) {
  const { userId, windowInMinutes } = req.body;
  try {
    const upcomingBookings = await getUpcomingBookings(userId, windowInMinutes);
    res.json(upcomingBookings);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetBookingDetails(req, res) {
  const { bookingId } = req.body; // Assuming bookingId is passed in the request body
  try {
    const bookingDetails = await getBookingDetails(bookingId);
    res.json(bookingDetails);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleGetUpcomingBookingSessions(req, res) {
  const creatorId = req.body; // Assuming creatorId is passed in the request body
  try {
    const upcomingBookingSessions = await getUpcomingBookingSessions(creatorId);
    res.json(upcomingBookingSessions);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}

export async function handleRegisterReadyState(req, res) {
  try {
    const { bookingId, userType } = req.body; // Assuming bookingId and userType are passed in the request body
    const result = await registerReadyState(bookingId, userType);
    res.json({ success: true, result });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }
}
