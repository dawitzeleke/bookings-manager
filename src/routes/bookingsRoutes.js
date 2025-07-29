import express from "express";
import {
  handleBookingExists,
  handleCalculatePrice,
  handleCreateBooking,
  handleDoesAppointmentCrossOver,
  handleGetBookingDetails,
  handleGetBookingStatus,
  handleGetCreatorBookings,
  handleGetgetCreatorBookingSettings,
  handleGetIsCreatorBookingSuspended,
  handleGetIsUserExistsAndValid,
  handleGetOfflineHours,
  handleGetResolveEffectiveHours,
  handleGetUpcomingBookings,
  handleGetUpcomingBookingSessions,
  handleGetUserBookingJson,
  handleGetUserIdFromBooking,
  handleIsBookingWithinOfflineHours,
  handleIsRequestedTimeAvailable,
  handleRegisterReadyState,
  handleSetBookingStatus,
  handleUpdateBookingSettings,
  handleUpdateBookingStatus,
  handleValidateBookingDuration,
} from "../controllers/bookingsController.js";
const router = express.Router();

// router.get("/getRollingWorkWindows", handleGetRollingWorkWindows);
router.post("/resolveEffectiveHours", handleGetResolveEffectiveHours);
router.get("/isUserExistsAndValid", handleGetIsUserExistsAndValid);
router.get("/getCreatorBookingSettings", handleGetgetCreatorBookingSettings);
router.get("/getCreatorBookings", handleGetCreatorBookings);
router.post("/isCreatorBookingSuspended", handleGetIsCreatorBookingSuspended);
router.post("/validateBookingDuration", handleValidateBookingDuration);
router.get("/getOfflineHours", handleGetOfflineHours);
router.post("/isBookingWithinOfflineHours", handleIsBookingWithinOfflineHours);
router.post("/createBooking", handleCreateBooking);
router.post("/calculatePrice", handleCalculatePrice);
router.post("/doesAppointmentCrossOver", handleDoesAppointmentCrossOver);
router.post("/isRequestedTimeAvailable", handleIsRequestedTimeAvailable);
router.post("/getUserBookingJson", handleGetUserBookingJson);
router.patch("/updateBookingSettings", handleUpdateBookingSettings);
// router.get('/validateAndSanitizeBookingSettings', handleValidateAndSanitizeBookingSettings);
router.post("/getUserIdFromBooking", handleGetUserIdFromBooking);
router.get("/getBookingStatus", handleGetBookingStatus);
router.patch("/updateBookingStatus", handleUpdateBookingStatus);
router.post("/bookingExists", handleBookingExists);
router.get("/setBookingStatus", handleSetBookingStatus);
router.post("/getUpcomingBookings", handleGetUpcomingBookings);
router.post("/getBookingDetails", handleGetBookingDetails);
router.get("/getUpcomingBookingSessions", handleGetUpcomingBookingSessions);
router.post("/registerReadyState", handleRegisterReadyState);

export default router;
