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
  handleGetRollingWorkWindows,
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

router.get("/getRollingWorkWindows", handleGetRollingWorkWindows);
router.get("/resolveEffectiveHours", handleGetResolveEffectiveHours);
router.get("/isUserExistsAndValid", handleGetIsUserExistsAndValid);
router.get("/getCreatorBookingSettings", handleGetgetCreatorBookingSettings);
router.get("/getCreatorBookings", handleGetCreatorBookings);
router.get("/isCreatorBookingSuspended", handleGetIsCreatorBookingSuspended);
router.get("/validateBookingDuration", handleValidateBookingDuration);
router.get("/getOfflineHours", handleGetOfflineHours);
router.post("/isBookingWithinOfflineHours", handleIsBookingWithinOfflineHours);
router.post("/createBooking", handleCreateBooking);
router.get("/calculatePrice", handleCalculatePrice);
router.get("/doesAppointmentCrossOver", handleDoesAppointmentCrossOver);
router.post("/isRequestedTimeAvailable", handleIsRequestedTimeAvailable);
router.get("/getUserBookingJson", handleGetUserBookingJson);
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
