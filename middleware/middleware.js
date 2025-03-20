import prisma from "../config/prisma.js";
import jwt from "jsonwebtoken";

const authMiddleware = async (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) {
        return res.status(401).json({ error: 'Authorization denied' });
    }

    try {
        const splitToken = token.split(" ")[1];
        const decoded = jwt.verify(splitToken, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });
        req.user = user;
        next();
    } catch (error) {
        console.error(error);
        res.status(401).json({ error: 'Invalid token' });
    }
}

const adminMiddleware = async (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
        return res.status(401).json({ message: 'Not Admin' });
    }
    next();
}

export { authMiddleware, adminMiddleware };
// In the above code, 
// we have created two middleware functions: authMiddleware and adminMiddleware. 
// The authMiddleware function checks the token in the Authorization header and verifies it using the jwt.verify() method. 
// If the token is valid, it decodes the payload and fetches the user data from the database using the decoded user ID. 
// The user data is then attached to the request object as req.user and the next() function is called to proceed to the next middleware or route handler.