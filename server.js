import express from "express";
import authRoute from "./routes/auth.js";
import movieRoute from "./routes/movieRoutes.js";
import bookingRoute from "./routes/bookingRoutes.js";
import { config } from './config/config.js';
import morgan from 'morgan';


const app = express();

// Middleware สำหรับการแปลง request body เป็น JSON
app.use(express.json());
app.use(morgan('dev'));
// Root route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the Movie Booking API!' }); // ใช้ JSON แทน plain text เพื่อความสม่ำเสมอ
});

// API Routes (ใช้ prefix '/api' แค่ครั้งเดียว)
app.use('/api', [
    authRoute,
    movieRoute,
    bookingRoute,
]);


// Error handling middleware (พื้นฐาน)
app.use((err, req, res, next) => {
    console.error(`Error: ${err.stack}`);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// เริ่มเซิร์ฟเวอร์
const startServer = () => {
    app.listen(config.port, () => {
        console.log(`Server is running on port ${config.port}`);
    });
};

// รันเซิร์ฟเวอร์
startServer();

export default app; // Export เพื่อให้สามารถทดสอบได้ (ถ้าต้องการ)