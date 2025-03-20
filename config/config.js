export const config = {
    port: process.env.PORT || 3000, // ใช้ environment variable ถ้ามี หรือ default เป็น 3000
    env: process.env.NODE_ENV || 'development', // เพื่อระบุสภาพแวดล้อม (dev, prod)
};