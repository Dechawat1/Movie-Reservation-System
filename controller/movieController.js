import prisma from "../config/prisma.js"; // นำเข้า Prisma Client เพื่อเชื่อมต่อกับฐานข้อมูล
import validator from "validator"; // นำเข้า validator เพื่อใช้ตรวจสอบ URL และข้อมูลอื่น ๆ

// ฟังก์ชันเพิ่มหนังใหม่ลงในระบบ
const addMovie = async (req, res) => {
    // ดึงข้อมูลจาก request body รวมถึง maxRows และ seatsPerRow ที่อาจส่งมาจาก frontend
    const { movieName, description, imageUrl, categoryId, userId, Showtime, maxRows: providedMaxRows, seatsPerRow: providedSeatsPerRow } = req.body;

    // 1. ตรวจสอบข้อมูลที่จำเป็นต้องมี
    if (!movieName || !imageUrl || !userId) {
        return res.status(400).json({
            success: false,
            message: "Movie name, image URL, and user ID are required"
        });
    }

    // 2. ตรวจสอบว่า imageUrl เป็น URL ที่ถูกต้อง
    if (!validator.isURL(imageUrl)) {
        return res.status(400).json({ success: false, message: "Invalid image URL" });
    }

    // 3. ตรวจสอบว่า userId ตรงกับผู้ใช้ที่ล็อกอิน (ป้องกันการเพิ่มหนังในนามผู้อื่น)
    if (parseInt(userId) !== req.user.id) {
        return res.status(403).json({ success: false, message: "You can only add movies as yourself" });
    }

    // 5. ตรวจสอบ Showtime ถ้ามี
    if (Showtime) {
        if (!Array.isArray(Showtime) || Showtime.length === 0) {
            return res.status(400).json({ success: false, message: "Showtime must be a non-empty array" });
        }
        for (const item of Showtime) {
            const start = new Date(item.startTime);
            const end = new Date(item.endTime);
            if (isNaN(start) || isNaN(end) || start >= end) {
                return res.status(400).json({ success: false, message: "Invalid startTime or endTime" });
            }
            if (!item.capacity || isNaN(parseInt(item.capacity)) || parseInt(item.capacity) <= 0) {
                return res.status(400).json({ success: false, message: "Capacity must be a positive number" });
            }
            // แก้ไข: ตรวจสอบว่า seats เป็น array หรือไม่ ถ้าไม่ใช่ให้ throw error หรือใช้ array ว่าง
            if (item.seats && !Array.isArray(item.seats)) {
                return res.status(400).json({
                    success: false,
                    message: "Seats must be an array if provided"
                });
            }
            if (item.seats && item.seats.length > parseInt(item.capacity)) {
                return res.status(400).json({
                    success: false,
                    message: "Seats length must not exceed capacity"
                });
            }
            if (item.seats) {
                for (const seat of item.seats) {
                    if (!seat.seatNumber || !seat.row || typeof seat.seatNumber !== 'string' || typeof seat.row !== 'string') {
                        return res.status(400).json({
                            success: false,
                            message: "Each seat must have a valid seatNumber and row as strings"
                        });
                    }
                }
                const seatNumbers = item.seats.map(s => s.seatNumber);
                if (new Set(seatNumbers).size !== seatNumbers.length) {
                    return res.status(400).json({ success: false, message: "Duplicate seat numbers are not allowed" });
                }
            }
        }
    }

    try {
        // 5. ใช้ transaction เพื่อสร้าง movie และข้อมูลที่เกี่ยวข้อง
        const newMovie = await prisma.$transaction(async (tx) => {
            // 6. ตรวจสอบว่า movieName ไม่ซ้ำกับที่มีอยู่
            const existingMovie = await tx.movie.findFirst({ where: { name: movieName } });
            if (existingMovie) {
                throw new Error("Movie with this name already exists");
            }

            // 7. ตรวจสอบ categoryId ถ้ามี
            if (categoryId) {
                const category = await tx.category.findUnique({ where: { id: parseInt(categoryId) } });
                if (!category) {
                    throw new Error("Category not found");
                }
            }

            // 8. สร้าง movie พร้อม Showtime และ Seat
            return await tx.movie.create({
                data: {
                    name: movieName,
                    description: description || null,
                    imageUrl: imageUrl,
                    categoryId: categoryId ? parseInt(categoryId) : null,
                    userId: parseInt(userId),
                    Showtime: Showtime ? {
                        create: Showtime.map((item) => {
                            // แก้ไข: ตรวจสอบว่า seats เป็น array หรือไม่ ถ้าไม่ใช่ให้เป็น array ว่าง
                            const providedSeats = Array.isArray(item.seats) ? item.seats : [];
                            const capacity = parseInt(item.capacity);
                            // กำหนด maxRows และ seatsPerRow จาก request หรือใช้ค่า default
                            const maxRows = item.maxRows ? parseInt(item.maxRows) : 10; // Default 10 แถว (A-J)
                            const seatsPerRow = item.seatsPerRow ? parseInt(item.seatsPerRow) : 15; // Default 15 ที่นั่งต่อแถว
                            const rows = Array.from({ length: maxRows }, (_, i) => String.fromCharCode(65 + i)); // สร้างแถว A-Z หรือตาม maxRows

                            const seatsToCreate = [];
                            const existingSeatNumbers = new Set(providedSeats.map(s => s.seatNumber));
                            let seatCount = providedSeats.length;

                            // เพิ่ม seats ที่ส่งมาจาก frontend
                            providedSeats.forEach(seat => {
                                seatsToCreate.push({
                                    seatNumber: seat.seatNumber,
                                    row: seat.row
                                });
                            });

                            // เติม seats ที่ขาดให้ครบตาม capacity
                            for (let row of rows) {
                                for (let i = 1; i <= seatsPerRow && seatCount < capacity; i++) {
                                    const seatNumber = `${row}${i}`;
                                    if (!existingSeatNumbers.has(seatNumber)) {
                                        seatsToCreate.push({
                                            seatNumber: seatNumber,
                                            row: row
                                        });
                                        seatCount++;
                                    }
                                }
                            }

                            return {
                                startTime: new Date(item.startTime),
                                endTime: new Date(item.endTime),
                                capacity: capacity,
                                price: parseFloat(item.price),
                                Seat: { create: seatsToCreate } // สร้าง Seat ทั้งหมด
                            };
                        })
                    } : undefined
                },
                select: {
                    id: true,
                    name: true,
                    description: true,
                    imageUrl: true,
                    categoryId: true,
                    userId: true,
                    Showtime: { select: { id: true, startTime: true, endTime: true, capacity: true, price: true } } // คืนข้อมูล Showtime บางส่วน
                }
            });
        });

        // 9. ส่ง response เมื่อสำเร็จ
        res.status(201).json({
            success: true,
            message: "Movie added successfully",
            movie: newMovie
        });
    } catch (err) {
        console.error("Error getting movies:", err); // บันทึก error ใน log
        res.status(500).json({
            success: false,
            message: "Failed to add movie",
            error: err.message
        });
    }
};

// ฟังก์ชันอัปเดตข้อมูลหนัง
const updateMovie = async (req, res) => {
    const { movieName, description, imageUrl, categoryId, Showtime } = req.body;
    const movieId = parseInt(req.params.id); // ดึง movieId จาก URL parameter

    // 1. ตรวจสอบว่า movieId ถูกต้อง
    if (isNaN(movieId)) {
        return res.status(400).json({ success: false, message: "Invalid movie ID" });
    }

    // 2. ตรวจสอบ imageUrl ถ้ามี
    if (imageUrl && !validator.isURL(imageUrl)) {
        return res.status(400).json({ success: false, message: "Invalid image URL" });
    }

    // 3. ตรวจสอบ Showtime ถ้ามี
    if (Showtime) {
        if (!Array.isArray(Showtime)) {
            return res.status(400).json({ success: false, message: "Showtime must be an array" });
        }
        for (const item of Showtime) {
            const start = new Date(item.startTime);
            const end = new Date(item.endTime);
            // ตรวจสอบวันที่ถ้ามีการส่งมา
            if ((item.startTime && isNaN(start)) || (item.endTime && isNaN(end)) || (start && end && start >= end)) {
                return res.status(400).json({ success: false, message: "Invalid startTime or endTime" });
            }
            // ตรวจสอบ capacity ถ้ามี
            if (item.capacity && (isNaN(parseInt(item.capacity)) || parseInt(item.capacity) <= 0)) {
                return res.status(400).json({ success: false, message: "Capacity must be a positive number" });
            }
            // ตรวจสอบ seats ถ้ามี
            if (item.seats) {
                if (!Array.isArray(item.seats) || (item.capacity && item.seats.length !== parseInt(item.capacity))) {
                    return res.status(400).json({
                        success: false,
                        message: "Seats must be an array with length matching capacity"
                    });
                }
                for (const seat of item.seats) {
                    if (!seat.seatNumber || !seat.row || typeof seat.seatNumber !== 'string' || typeof seat.row !== 'string') {
                        return res.status(400).json({
                            success: false,
                            message: "Each seat must have a valid seatNumber and row as strings"
                        });
                    }
                }
                const seatNumbers = item.seats.map(s => s.seatNumber);
                if (new Set(seatNumbers).size !== seatNumbers.length) {
                    return res.status(400).json({ success: false, message: "Duplicate seat numbers are not allowed" });
                }
            }
        }
    }

    try {
        // 4. ใช้ transaction เพื่ออัปเดต movie และข้อมูลที่เกี่ยวข้อง
        const updatedMovie = await prisma.$transaction(async (tx) => {
            // 5. ตรวจสอบว่า movie มีอยู่จริง
            const existingMovie = await tx.movie.findUnique({ where: { id: movieId } });
            if (!existingMovie) {
                throw new Error("Movie not found");
            }

            // 6. ตรวจสอบ categoryId ถ้ามี
            if (categoryId) {
                const category = await tx.category.findUnique({ where: { id: parseInt(categoryId) } });
                if (!category) {
                    throw new Error("Category not found");
                }
            }

            // 7. เตรียมข้อมูลสำหรับอัปเดต movie (เฉพาะฟิลด์ที่มีการส่งมา)
            const movieData = {
                ...(movieName && { name: movieName }),
                ...(description !== undefined && { description: description || null }),
                ...(imageUrl && { imageUrl }),
                ...(categoryId !== undefined && { categoryId: categoryId ? parseInt(categoryId) : null })
            };

            // 8. อัปเดต movie
            const updatedMovie = await tx.movie.update({
                where: { id: movieId },
                data: movieData,
                select: {
                    id: true,
                    name: true,
                    description: true,
                    imageUrl: true,
                    categoryId: true,
                    userId: true,
                    Showtime: { select: { id: true, startTime: true, endTime: true, capacity: true, price: true } }
                }
            });

            // 9. อัปเดตหรือสร้าง Showtime (ถ้ามี)
            if (Showtime) {
                for (const item of Showtime) {
                    const showtimeData = {
                        movieId: movieId,
                        startTime: new Date(item.startTime),
                        endTime: new Date(item.endTime),
                        capacity: parseInt(item.capacity),
                        price: item.price ? parseFloat(item.price) : 200 // Default price ถ้าไม่ระบุ
                    };
                    // upsert: ถ้ามี id อัปเดต ถ้าไม่มีสร้างใหม่
                    const upsertedShowtime = await tx.showtime.upsert({
                        where: { id: item.id || 0 }, // id = 0 จะสร้างใหม่เสมอถ้าไม่ระบุ
                        update: showtimeData,
                        create: showtimeData
                    });

                    // 10. อัปเดต Seat (ลบเก่าแล้วสร้างใหม่)
                    if (item.seats) {
                        await tx.seat.deleteMany({ where: { showtimeId: upsertedShowtime.id } });
                        await tx.seat.createMany({
                            data: item.seats.map((seat) => ({
                                showtimeId: upsertedShowtime.id,
                                seatNumber: seat.seatNumber,
                                row: seat.row
                            }))
                        });
                    }
                }
            }

            return updatedMovie;
        });

        // 11. ส่ง response เมื่อสำเร็จ
        res.status(200).json({
            success: true,
            message: "Movie updated successfully",
            movie: updatedMovie
        });
    } catch (err) {
        console.error("Error updating movie:", err);
        res.status(500).json({
            success: false,
            message: "Failed to update movie",
            error: err.message
        });
    }
};

// ฟังก์ชันดึงรายการหนังทั้งหมด (มี pagination และ filter)
const getMovies = async (req, res) => {
    try {
        // 1. ดึง query parameters: page, limit, categoryId
        const { page = 1, limit = 10, categoryId } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit); // คำนวณจำนวนที่ต้องข้าม

        // 2. สร้างเงื่อนไข where ถ้ามี categoryId
        const where = categoryId ? { categoryId: parseInt(categoryId) } : {};

        // 3. ดึงข้อมูล movies จากฐานข้อมูล
        const movies = await prisma.movie.findMany({
            skip,
            take: parseInt(limit), // จำกัดจำนวนผลลัพธ์
            where,
            include: {
                Showtime: {
                    include: {
                        Seat: true // รวมข้อมูล Seat ของแต่ละ Showtime
                    }
                }
            }
        });

        // 4. ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (movies.length === 0) {
            return res.status(200).json({ success: true, message: "No movies found", data: [] });
        }

        // 5. ส่ง response เมื่อสำเร็จ
        res.status(200).json({ success: true, message: "Success GetList Movies", data: movies });
    } catch (err) {
        console.error("Error fetching movies:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get list movie",
            error: err.message
        });
    }
};

// ฟังก์ชันดึงข้อมูลหนังตาม ID
const getMovie = async (req, res) => {
    const movieId = req.params.id; // ดึง movieId จาก URL parameter

    // 1. ตรวจสอบว่า movieId มีค่า
    if (movieId == null || undefined) { // หมายเหตุ: ควรใช้ === null || movieId === undefined
        return res.status(401).json({ message: "Id Not Found" });
    }

    try {
        // 2. ดึงข้อมูล movie จากฐานข้อมูล
        const movie = await prisma.movie.findUnique({
            where: {
                id: parseInt(movieId)
            },
            include: {
                Showtime: {
                    include: {
                        Seat: true // รวมข้อมูล Seat ของ Showtime
                    }
                }
            }
        });

        // 3. ส่ง response เมื่อสำเร็จ
        res.status(200).json({ success: true, message: "Success Get Movie", data: movie });
    } catch (err) {
        console.error("Error fetching movie:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get movie",
            error: err.message
        });
    }
};

// ฟังก์ชันลบหนัง
const deleteMovie = async (req, res) => {
    const { id } = req.params; // ดึง id จาก URL parameter

    // 1. ตรวจสอบว่า id ถูกต้อง
    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
            success: false,
            message: "Invalid movie ID"
        });
    }

    try {
        // 2. ตรวจสอบว่า movie มีอยู่จริง
        const movieExists = await prisma.movie.findUnique({
            where: { id: parseInt(id) }
        });
        if (!movieExists) {
            return res.status(404).json({
                success: false,
                message: "Movie not found"
            });
        }

        // 3. ใช้ transaction เพื่อลบ movie และข้อมูลที่เกี่ยวข้อง
        const movie = await prisma.$transaction(async (prisma) => {
            // ลบ Seat ที่เกี่ยวข้องกับ Showtime ของ movie
            await prisma.seat.deleteMany({
                where: { showtime: { movieId: parseInt(id) } }
            });

            // ลบ Showtime ของ movie
            await prisma.showtime.deleteMany({
                where: { movieId: parseInt(id) }
            });

            // ลบ movie
            return await prisma.movie.delete({
                where: { id: parseInt(id) }
            });
        });

        // 4. ส่ง response เมื่อสำเร็จ
        res.status(200).json({
            success: true,
            message: "Movie and related data deleted successfully",
            data: movie
        });
    } catch (err) {
        console.error("Error delete movie:", err);
        res.status(500).json({
            success: false,
            message: "Failed to delete movie",
            error: err.message
        });
    }
};

// ฟังก์ชันดึงรอบฉายของหนังตาม ID
const getMovieShowtimes = async (req, res) => {
    const { id } = req.params; // ดึง id จาก URL parameter

    // 1. ตรวจสอบว่า id ถูกต้อง
    if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({
            success: false,
            message: "Invalid movie ID"
        });
    }

    try {
        // 2. ดึงข้อมูล movie และ Showtime
        const movie = await prisma.movie.findUnique({
            where: {
                id: parseInt(id)
            },
            include: {
                Showtime: true // รวมข้อมูล Showtime
            }
        });

        // 3. ตรวจสอบว่า movie มีอยู่
        if (!movie) {
            return res.status(404).json({
                success: false,
                message: "Movie not found"
            });
        }

        // 4. ส่ง response เมื่อสำเร็จ
        res.status(200).json({
            success: true,
            message: "Movie showtimes retrieved successfully",
            data: movie
        });
    } catch (err) {
        console.error("Error get movie showtime:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get movie showtime",
            error: err.message
        });
    }
};

// ฟังก์ชันดึงรอบฉายทั้งหมด (สามารถกรองตามวันที่ได้)
const getShowtimes = async (req, res) => {
    const { date } = req.query; // รับ query parameter เช่น ?date=2025-03-15

    try {
        // 1. สร้างตัวกรองวันที่ถ้ามี
        let dateFilter = {};
        if (date) {
            const parsedDate = new Date(date);
            if (isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid date format. Use YYYY-MM-DD"
                });
            }

            // กำหนดช่วงเวลาเริ่มต้นและสิ้นสุดของวัน
            const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
            const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

            dateFilter = {
                startTime: {
                    gte: startOfDay, // มากกว่าหรือเท่ากับเริ่มต้นวัน
                    lte: endOfDay    // น้อยกว่าหรือเท่ากับสิ้นสุดวัน
                }
            };
        }

        // 2. ดึงข้อมูล Showtime จากฐานข้อมูล
        const showtimes = await prisma.showtime.findMany({
            where: dateFilter, // กรองตามวันที่ถ้ามี
            include: {
                movie: {
                    select: { id: true, name: true } // รวมข้อมูล movie บางส่วน
                }
            },
            orderBy: {
                startTime: "asc" // เรียงตามเวลาเริ่มต้นจากน้อยไปมาก
            }
        });

        // 3. ตรวจสอบว่ามีผลลัพธ์หรือไม่
        if (showtimes.length === 0) {
            return res.status(200).json({
                success: true,
                message: "No showtimes found",
                data: []
            });
        }

        // 4. ส่ง response เมื่อสำเร็จ
        res.status(200).json({
            success: true,
            message: "Showtimes retrieved successfully",
            data: showtimes
        });
    } catch (err) {
        console.error("Error getting showtimes:", err);
        res.status(500).json({
            success: false,
            message: "Failed to get showtimes",
            error: err.message
        });
    }
};

// ส่งออกฟังก์ชันทั้งหมดเพื่อใช้งานใน router
export { addMovie, updateMovie, getMovies, getMovie, deleteMovie, getMovieShowtimes, getShowtimes };