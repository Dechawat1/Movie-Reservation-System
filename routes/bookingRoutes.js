import express from 'express';
import { authMiddleware, adminMiddleware } from '../middleware/middleware.js'
import { getAvailableSeats, bookSeats, getUserBookings, cancelBooking, getAllBookings, getReports } from "../controller/bookingController.js"
const bookRoute = express.Router();


bookRoute.get('/showtimes/:id/seats', authMiddleware, getAvailableSeats)
bookRoute.post('/bookings', authMiddleware, bookSeats);
bookRoute.get('/bookings', authMiddleware, getUserBookings);
bookRoute.delete('/bookings/:id', authMiddleware, cancelBooking);
bookRoute.get('/admin/bookings', authMiddleware, adminMiddleware, getAllBookings);
bookRoute.get('/admin/reports', authMiddleware, adminMiddleware, getReports);




export default bookRoute;
// In the above code, we have created a new bookRoute object using the express.Router() method.