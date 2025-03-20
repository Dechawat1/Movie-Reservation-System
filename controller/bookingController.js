import prisma from "../config/prisma.js"; // นำเข้า Prisma Client เพื่อเชื่อมต่อกับฐานข้อมูล

// ฟังก์ชันดึงที่นั่งที่ว่างสำหรับรอบฉายที่ระบุ
const getAvailableSeats = async (req, res) => {
    const { id } = req.params; // ดึง showtimeId จาก URL parameter

    try {
        // 1. ค้นหา Showtime และข้อมูลที่นั่ง (Seat) พร้อม BookingSeat
        const showtime = await prisma.showtime.findUnique({
            where: {
                id: parseInt(id) // แปลง id เป็น integer
            },
            include: {
                Seat: {
                    include: {
                        BookingSeat: true // รวมข้อมูล BookingSeat เพื่อเช็คว่าถูกจองหรือไม่
                    }
                }
            }
        });

        // 2. ตรวจสอบว่า Showtime มีอยู่หรือไม่
        if (!showtime) {
            return res.status(404).json({
                success: false,
                message: "Showtime not found",
            });
        }

        // 3. กรองที่นั่งที่ว่าง (ไม่มี BookingSeat) โดยใช้ Prisma query
        const availableSeats = await prisma.seat.findMany({
            where: {
                showtimeId: parseInt(id),
                BookingSeat: { none: {} } // เลือกเฉพาะที่นั่งที่ไม่มี BookingSeat (ว่าง)
            },
        });

        // 4. ส่ง response กลับเมื่อสำเร็จ
        res.status(200).json({
            success: true,
            message: "Available seats retrieved successfully",
            availableSeats: availableSeats, // คืนรายการที่นั่งที่ว่าง
        });
    } catch (err) {
        // 5. จัดการ error ที่เกิดขึ้น
        console.error("Error fetching available seats:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get available seats",
            error: err.message
        });
    }
};

// ฟังก์ชันจองที่นั่งในรอบฉายที่ระบุ
const bookSeats = async (req, res) => {
    // 1. รับข้อมูลจาก request body
    const { showtimeId, seatIds, totalPrice } = req.body;

    // 2. ตรวจสอบ input ว่า showtimeId เป็นตัวเลข และ seatIds เป็นอาร์เรย์ที่ไม่ว่าง
    if (isNaN(parseInt(showtimeId)) || !Array.isArray(seatIds) || seatIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: "Invalid showtime ID or seat IDs. Showtime ID must be a number and seat IDs must be a non-empty array",
        });
    }

    try {
        // 3. ใช้ transaction เพื่อให้แน่ใจว่าการจองสำเร็จหรือยกเลิกทั้งหมด
        const bookingResult = await prisma.$transaction(async (prisma) => {
            // 4. ตรวจสอบว่ารอบฉาย (Showtime) มีอยู่จริง
            const existingShowtime = await prisma.showtime.findUnique({
                where: {
                    id: parseInt(showtimeId),
                },
            });

            // 5. ถ้าไม่พบ Showtime ส่ง error
            if (!existingShowtime) {
                throw new Error("Showtime not found");
            }

            // 6. ค้นหาที่นั่งทั้งหมดที่ระบุใน seatIds และผูกกับ showtimeId
            const existingSeats = await prisma.seat.findMany({
                where: {
                    seatNumber: { in: seatIds }, // ค้นหาด้วย seatNumber (เช่น "A1", "A2")
                    showtimeId: parseInt(showtimeId),
                },
                include: {
                    BookingSeat: true, // รวมข้อมูล BookingSeat เพื่อเช็คว่าถูกจองหรือไม่
                },
            });

            // 7. ดึง seatNumber ที่พบจากผลลัพธ์
            const existingSeatNumbers = existingSeats.map(seat => seat.seatNumber);

            // 8. ถ้าไม่พบที่นั่งเลย ส่ง error
            if (existingSeatNumbers.length === 0) {
                throw new Error("No seats found");
            }

            // 9. ถ้าพบที่นั่งไม่ครบตามที่ขอ ส่ง error
            if (existingSeatNumbers.length !== seatIds.length) { // แก้จาก existingSeats.length เป็น seatIds.length
                throw new Error("One or more seats not found");
            }

            // 10. ตรวจสอบว่ามีที่นั่งใดถูกจองแล้วหรือไม่
            const bookedSeats = existingSeats.filter(seat => seat.BookingSeat.length > 0);
            if (bookedSeats.length > 0) {
                throw new Error("One or more seats are already booked");
            }

            // 11. สร้างการจอง (Booking) ใหม่
            const newBooking = await prisma.booking.create({
                data: {
                    userId: req.user.id, // ใช้ userId จาก authentication middleware (สมมติ)
                    showtimeId: parseInt(showtimeId),
                    totalPrice: parseFloat(totalPrice) // ราคารวมของการจอง
                },
            });

            // 12. สร้าง BookingSeat เพื่อผูกที่นั่งกับการจอง
            const bookingSeatsData = existingSeats.map(seat => ({
                bookingId: newBooking.id,
                seatId: seat.id, // ใช้ id ของ Seat ที่พบ
            }));
            await prisma.bookingSeat.createMany({
                data: bookingSeatsData,
            });

            // 13. คืนผลลัพธ์ของการจอง
            return {
                bookingId: newBooking.id,
                showtimeId: parseInt(showtimeId),
                seatNumbers: existingSeatNumbers,
                totalPrice: parseFloat(totalPrice),
            };
        });

        // 14. ส่ง response กลับเมื่อสำเร็จ
        res.status(201).json({
            success: true,
            message: "Seats booked successfully",
            booking: bookingResult,
        });
    } catch (err) {
        // 15. จัดการ error ที่เกิดขึ้น
        console.error("Error booking seats:", err);
        res.status(500).json({
            success: false,
            message: "Failed to book seats",
            error: err.message,
        });
    }
};

// ฟังก์ชันดึงการจองของผู้ใช้ที่ล็อกอิน
const getUserBookings = async (req, res) => {
    try {
        // 1. ดึงข้อมูลการจองของผู้ใช้จาก userId (สมมติจาก authentication)
        const userBookings = await prisma.booking.findMany({ // แก้จาก findUnique เป็น findMany เพราะผู้ใช้มีได้หลายการจอง
            where: {
                userId: req.user.id // ใช้ userId แทน id
            },
            include: {
                seats: {
                    include: {
                        seat: true
                    }
                }
            }
        });

        // 2. ส่ง response กลับเมื่อสำเร็จ
        res.status(200).json({ // ควรเป็น 200 แทน 201 เพราะเป็นการดึงข้อมูล ไม่ใช่สร้าง
            success: true,
            message: "Booking user successfully",
            booking: userBookings,
        });
    } catch (err) {
        // 3. จัดการ error ที่เกิดขึ้น
        console.error("Error User Bookings:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get user bookings",
            error: err.message
        });
    }
};
const cancelBooking = async (req, res) => {
    //ยกเลิกการจอง (เฉพาะรอบที่ยังไม่ฉาย)
    const { id } = req.params
    if (isNaN(id)) {
        return res.status(404).json({ success: false, message: "id Not Found" })
    }
    try {
        const booking = await prisma.booking.findUnique({
            where: {
                id: parseInt(id)
            },
            include: {
                showtime: true
            }
        })

        if (!booking) {
            return res.status(404).json({ success: false, message: "Booking not found" })
        }
        if (booking.userId !== req.user.id) {
            return res.status(403).json({ success: false, message: "You can only cancel your own bookings" });
        }

        // 2. ตรวจสอบว่ารอบฉายยังไม่เริ่ม
        if (new Date() >= booking.showtimeId.startTime) {
            return res.status(400).json({ success: false, message: "Cannot cancel past or ongoing showtime" });
        }

        // 3. ลบ BookingSeat และ Booking
        await prisma.$transaction(async (prisma) => {
            await prisma.bookingSeat.deleteMany({ where: { bookingId: parseInt(id) } });
            await prisma.booking.delete({ where: { id: parseInt(id) } });
        });

        // 4. ส่ง response เมื่อสำเร็จ
        res.status(200).json({ success: true, message: "Booking cancelled successfully" });


    } catch (err) {
        console.error("Error Cancel Bookings:", err);
        res.status(500).json({
            success: false,
            message: "Failed to Cancel bookings",
            error: err.message
        });
    }
}
// ฟังก์ชันดึงการจองทั้งหมด (สำหรับ Admin)
const getAllBookings = async (req, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Admin access required" });
    }

    try {
        const bookings = await prisma.booking.findMany({
            include: {
                user: { select: { id: true, username: true } },
                showtime: { include: { movie: true } },
                seats: { include: { seat: true } }
            }
        });

        res.status(200).json({
            success: true,
            message: "All bookings retrieved successfully",
            data: bookings
        });
    } catch (err) {
        console.error("Error fetching all bookings:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get all bookings",
            error: err.message
        });
    }
};
const getReports = async (req, res) => {
    if (req.user.role !== "ADMIN") {
        return res.status(403).json({ success: false, message: "Admin access required" });
    }

    const { startDate, endDate } = req.query;

    try {
        const dateFilter = startDate && endDate ? {
            createdAt: {
                gte: new Date(startDate),
                lte: new Date(endDate)
            }
        } : {};

        const bookings = await prisma.booking.findMany({
            where: dateFilter,
            include: {
                showtime: { include: { movie: true } },
                seats: true
            }
        });

        const totalBookings = bookings.length;
        const totalSeatsBooked = bookings.reduce((sum, b) => sum + b.seats.length, 0);
        const totalRevenue = bookings.reduce((sum, b) => sum + b.totalPrice, 0);
        const revenueByMovie = bookings.reduce((acc, b) => {
            const movieName = b.showtime.movie.name;
            acc[movieName] = (acc[movieName] || 0) + b.totalPrice;
            return acc;
        }, {});

        res.status(200).json({
            success: true,
            message: "Reports retrieved successfully",
            data: {
                totalBookings,
                totalSeatsBooked,
                totalRevenue,
                revenueByMovie
            }
        });
    } catch (err) {
        console.error("Error fetching reports:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get reports",
            error: err.message
        });
    }
};


// หมายเหตุ
// /api/showtimes/:id/seats: Return รายการ Seat ที่ว่าง (ไม่มี BookingSeat)
// /api/bookings: รับ showtimeId, seatIds และสร้าง Booking + BookingSeat
// /api/bookings/:id: ตรวจสอบว่าเป็นของผู้ใช้และ startTime ยังไม่ถึงก่อนลบ
// /api/admin/reports: Return สถิติ เช่น จำนวนการจอง, ที่นั่งที่ใช้, รายได้รวม

export { getAvailableSeats, bookSeats, getUserBookings, cancelBooking, getAllBookings, getReports }