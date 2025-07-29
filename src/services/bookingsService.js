import BookingsManager from "../../BookingsManager.js";

export async function getRollingWorkWindows(bookingSettings) {
  try {
    const rollingWorkingWindows = await BookingsManager.getRollingWorkWindows(
      bookingSettings
    );
    return rollingWorkingWindows;
  } catch (error) {
    console.error("Error fetching rolling work windows:", error);
    throw new Error("Internal Server Error");
  }
}

export async function resolveEffectiveHours(bookingSettings) {
  try {
    const effectiveHours = await BookingsManager.resolveEffectiveHours(
      bookingSettings
    );
    return effectiveHours;
  } catch (error) {
    console.error("Error resolving effective hours:", error);
    throw new Error("Internal Server Error");
  }
}

export async function isUserExistsAndValid(userId) {
  try {
    const isValid = await BookingsManager.isUserExistsAndValid(userId);
    return isValid;
  } catch (error) {
    console.error("Error checking user validity:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getCreatorBookingSettings(creatorId) {
  try {
    const bookingSettings = await BookingsManager.getCreatorBookingSettings(
      creatorId
    );
    return bookingSettings;
  } catch (error) {
    console.error("Error fetching creator booking settings:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getCreatorBookings(creatorId) {
  try {
    const bookingSettings = await BookingsManager.getCreatorsBookings(
      creatorId
    );
    return bookingSettings;
  } catch (error) {
    console.error("Error fetching creator bookings:", error);
    throw new Error("Internal Server Error");
  }
}

export async function isCreatorBookingSuspended(
  creatorId,
  date,
  bookingSettings
) {
  try {
    const isSuspended = await BookingsManager.isCreatorBookingSuspended(
      creatorId,
      date,
      bookingSettings
    );
    return isSuspended;
  } catch (error) {
    console.error("Error checking if creator booking is suspended:", error);
    throw new Error("Internal Server Error");
  }
}

export async function validateBookingDuration(
  creatorId,
  bookingStart,
  bookingEnd,
  bookingSettings
) {
  try {
    const isValid = await BookingsManager.validateBookingDuration(
      creatorId,
      bookingStart,
      bookingEnd,
      bookingSettings
    );
    return isValid;
  } catch (error) {
    console.error("Error validating booking duration:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getOfflineHours(bookingSettings) {
  try {
    const offlineHours = await BookingsManager.getOfflineHours(bookingSettings);
    return offlineHours;
  } catch (error) {
    console.error("Error fetching offline hours:", error);
    throw new Error("Internal Server Error");
  }
}

export async function isBookingWithinOfflineHours(
  creatorId,
  bookingStartTime,
  bookingEndTime,
  date,
  bookingSettings
) {
  try {
    const isWithinOfflineHours =
      await BookingsManager.isBookingWithinOfflineHours(
        creatorId,
        bookingStartTime,
        bookingEndTime,
        date,
        bookingSettings
      );
    return isWithinOfflineHours;
  } catch (error) {
    console.error("Error checking booking offline hours:", error);
    throw new Error("Internal Server Error");
  }
}

export async function createBooking(
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
  try {
    const booking = await BookingsManager.createBooking(
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
    return booking;
  } catch (error) {
    console.error("Error creating booking:", error);
    throw new Error("Internal Server Error");
  }
}

export async function calculatePrice(
  creatorId,
  appointmentStart,
  appointmentEnd,
  date,
  defaultTokenPerMinute,
  surchargeTokenPerMinute,
  bookingSettings
) {
  try {
    const price = await BookingsManager.calculatePrice(
      creatorId,
      appointmentStart,
      appointmentEnd,
      date,
      defaultTokenPerMinute,
      surchargeTokenPerMinute,
      bookingSettings
    );
    return price;
  } catch (error) {
    console.error("Error calculating price:", error);
    throw new Error("Internal Server Error");
  }
}

export async function doesAppointmentCrossOver(
  creatorId,
  appointmentStart,
  appointmentEnd,
  date,
  bookingSettings
) {
  try {
    const doesCrossOver = await BookingsManager.doesAppointmentCrossOver(
      creatorId,
      appointmentStart,
      appointmentEnd,
      date,
      bookingSettings
    );
    return doesCrossOver;
  } catch (error) {
    console.error("Error checking appointment crossover:", error);
    throw new Error("Internal Server Error");
  }
}

export async function isRequestedTimeAvailable(
  creatorId,
  requestedStart,
  requestedEnd,
  recurrenceRule = null
) {
  try {
    const isAvailable = await BookingsManager.isRequestedTimeAvailable(
      creatorId,
      requestedStart,
      requestedEnd,
      recurrenceRule
    );
    return isAvailable;
  } catch (error) {
    console.error("Error checking requested time availability:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getUserBookingJson(creatorId, bookingSettings) {
  try {
    const bookingJson = await BookingsManager.getUserBookingJson(
      creatorId,
      bookingSettings
    );
    return bookingJson;
  } catch (error) {
    console.error("Error fetching user booking JSON:", error);
    throw new Error("Internal Server Error");
  }
}

export async function updateBookingSettings(userId, settingsObject, options) {
  try {
    const updatedSettings = await BookingsManager.updateBookingSettings(
      userId,
      settingsObject,
      options
    );
    return updatedSettings;
  } catch (error) {
    console.error("Error updating booking settings:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getUserIdFromBooking(bookingId, role) {
  try {
    const userId = await BookingsManager.getUserIdFromBooking(bookingId, role);
    return userId;
  } catch (error) {
    console.error("Error fetching user ID from booking:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getBookingStatus(bookingId) {
  try {
    const status = await BookingsManager.getBookingStatus(bookingId);
    return status;
  } catch (error) {
    console.error("Error fetching booking status:", error);
    throw new Error("Internal Server Error");
  }
}

export async function updateBookingStatus(bookingId, newStatus) {
  try {
    const updatedStatus = await BookingsManager.updateBookingStatus(
      bookingId,
      newStatus
    );
    return updatedStatus;
  } catch (error) {
    console.error("Error updating booking status:", error);
    throw new Error("Internal Server Error");
  }
}

export async function bookingExists(bookingId) {
  try {
    const exists = await BookingsManager.bookingExists(bookingId);
    return exists;
  } catch (error) {
    console.error("Error checking if booking exists:", error);
    throw new Error("Internal Server Error");
  }
}

export async function setBookingStatus(bookingId, newStatus) {
  try {
    const updatedBooking = await BookingsManager.setBookingStatus(
      bookingId,
      newStatus
    );
    return updatedBooking;
  } catch (error) {
    console.error("Error setting booking status:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getUpcomingBookings(userId = null, windowInMinutes = 60) {
  try {
    const upcomingBookings = await BookingsManager.getUpcomingBookings(
      userId,
      windowInMinutes
    );
    return upcomingBookings;
  } catch (error) {
    console.error("Error fetching upcoming bookings:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getBookingDetails(bookingId) {
  try {
    const bookingDetails = await BookingsManager.getBookingDetails(bookingId);
    return bookingDetails;
  } catch (error) {
    console.error("Error fetching booking details:", error);
    throw new Error("Internal Server Error");
  }
}

export async function getUpcomingBookingSessions(creatorId) {
  try {
    const upcomingSessions = await BookingsManager.getUpcomingBookingSessions(
      creatorId
    );
    return upcomingSessions;
  } catch (error) {
    console.error("Error fetching upcoming booking sessions:", error);
    throw new Error("Internal Server Error");
  }
}

export async function registerReadyState(bookingId, userType) {
  try {
    const result = await BookingsManager.registerReadyState(
      bookingId,
      userType
    );
    return result;
  } catch (error) {
    console.error("Error registering ready state:", error);
    throw new Error("Internal Server Error");
  }
}
