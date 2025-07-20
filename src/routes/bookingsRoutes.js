import express from 'express';
import {handleGetRollingWorkWindows, handleGetResolveEffectiveHours, handleGetIsUserExistsAndValid, handleGetgetCreatorBookingSettings, handleGetIsCreatorBookingSuspended, handleValidateBookingDuration, handleGetOfflineHours, handleIsBookingWithinOfflineHours, handleCreateBooking, handleCalculatePrice, handleDoesAppointmentCrossOver, handleIsRequestedTimeAvailable, handleGetUserBookingJson, handleUpdateBookingSettings, handleGetUserIdFromBooking, handleGetBookingStatus, handleUpdateBookingStatus, handleBookingExists, handleSetBookingStatus, handleGetUpcomingBookings, handleGetBookingDetails, handleGetUpcomingBookingSessions, handleRegisterReadyState} from '../controllers/bookingsController.js';
const router = express.Router();


router.get('/getRollingWorkWindows', handleGetRollingWorkWindows);
router.get('/resolveEffectiveHours', handleGetResolveEffectiveHours);
router.get('/isUserExistsAndValid', handleGetIsUserExistsAndValid);
router.get('/getCreatorBookingSettings', handleGetgetCreatorBookingSettings);
router.get('/isCreatorBookingSuspended', handleGetIsCreatorBookingSuspended);
router.get('/validateBookingDuration', handleValidateBookingDuration);
router.get('/getOfflineHours', handleGetOfflineHours);
router.get('/isBookingWithinOfflineHours', handleIsBookingWithinOfflineHours);
router.post('/createBooking', handleCreateBooking);
router.get('/calculatePrice', handleCalculatePrice);
router.get('/doesAppointmentCrossOver', handleDoesAppointmentCrossOver);
router.post('/isRequestedTimeAvailable', handleIsRequestedTimeAvailable);
router.get('/getUserBookingJson', handleGetUserBookingJson);
router.patch('/updateBookingSettings', handleUpdateBookingSettings);
// router.get('/validateAndSanitizeBookingSettings', handleValidateAndSanitizeBookingSettings);
router.get('/getUserIdFromBooking', handleGetUserIdFromBooking);
router.get('/getBookingStatus', handleGetBookingStatus);
router.patch('/updateBookingStatus', handleUpdateBookingStatus);
router.get('/bookingExists', handleBookingExists);
router.get('/setBookingStatus', handleSetBookingStatus);    
router.get('/getUpcomingBookings', handleGetUpcomingBookings);
router.get('/getBookingDetails', handleGetBookingDetails);
router.get('/getUpcomingBookingSessions', handleGetUpcomingBookingSessions);
router.get('/registerReadyState', handleRegisterReadyState);

export default router;