import prisma from '../config/prisma.js'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import validator from 'validator'


const signUp = async (req, res) => {
    const { username, email, password } = req.body
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Username email and password are required' });
    }
    console.log(req.body);

    // Function implementation goes here
    try {
        const exists = await prisma.user.findFirst({ where: { email: email } });
        if (exists) {
            return res.status(400).json({ success: false, message: "Email already exists" })
        }

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.status(400).json({ success: false, message: "รูปแบบอีเมลไม่ถูกต้อง" })
        }

        if (password.length < 8) {
            return res.status(400).json({ success: false, message: "รหัสผ่านไม่ปลอดภัย" })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt);

        const users = await prisma.user.create({
            data: {
                username,
                email: email,
                password: hashedPassword
            }
        });
        res.status(201).json({ message: 'User registered successfully', data: users });
    } catch (error) {
        console.error(error.stack)
        res.status(500).json({ error: 'Database error' });
    }

}

const logIn = async (req, res) => {
    const { email, password } = req.body
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const user = await prisma.user.findFirst({ where: { email: email } });
        if (!user) {
            return res.status(400).json({ success: false, message: "ไม่พบอีเมลนี้ในระบบ" })
        }

        // compare password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ success: false, message: "รหัสผ่านไม่ถูกต้อง" })
        }

        // Create Payload
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role
        }

        // create token
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });


        res.status(200).json({
            success: true, message: "เข้าสู่ระบบสำเร็จ", token: token, user: {
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database error' });

    }
}


const getUser = async (req, res) => {
    //ดึงข้อมูลผู้ใช้ที่ล็อกอิน
    try {
        const user = await prisma.user.findUnique({
            where: { id: parseInt(req.user.id) },
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true
                // password ถูก exclude โดยอัตโนมัติ
            }
        })
        if (!user) res.status(404).json({ message: "Not Found" })

        res.status(200).json({ success: true, message: "User retrieved successfully", data: user })
    } catch (error) {
        console.error(error.stack)
        res.status(500).json({ success: false, message: error.message })

    }
}

const updateUserRole = async (req, res) => {
    //อัปเดตบทบาทผู้ใช้ (เช่น เลื่อนเป็น admin)
    const { role } = req.body
    const userId = parseInt(req.params.id)

    if (!role || !['USER', 'ADMIN'].includes(role))
        res.status(400).json({ success: false, message: "Please select Role USER AND ADMIN" })

    if (isNaN(userId)) res.status(400).json({ success: false, message: "Id Not type Int" })


    try {
        const updateRole = await prisma.user.update({
            where: {
                id: userId
            },
            data: {
                role: role
            }
        })
        res.status(200).json({ success: true, message: "Change Role Success", data: updateRole })
    } catch (error) {
        console.error(error.stack)
        res.status(500).json({ success: false, message: error.message })
    }

}

const getUsers = async (req, res) => {
    //ดึงรายการผู้ใช้ทั้งหมด (สำหรับ admin)
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                role: true,
                createdAt: true

            }
        })
        res.status(200).json({ success: true, message: " Get All Users Success", data: users })
    } catch (error) {
        console.error(error.stack)
        res.status(500).json({ success: false, message: error.message })

    }
}


// หมายเหตุ
// /api/register: รับ email, password, name และสร้างผู้ใช้ทั่วไป
// /api/login: รับ email, password และ return JWT token
// /api/users/:id/role: เฉพาะ admin สามารถเปลี่ยน role (เช่น user → admin)

export { signUp, logIn, getUser, updateUserRole, getUsers }