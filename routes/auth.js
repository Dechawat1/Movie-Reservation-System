import express from 'express'
import { logIn, signUp, getUser, updateUserRole, getUsers } from '../controller/authController.js'
import { authMiddleware, adminMiddleware } from '../middleware/middleware.js';

const authRoute = express.Router()

authRoute.post('/register', signUp);
authRoute.post('/login', logIn);
authRoute.get('/users/me', authMiddleware, getUser);
authRoute.put('/users/:id/role', authMiddleware, adminMiddleware, updateUserRole);
authRoute.get('/users', authMiddleware, adminMiddleware, getUsers);


export default authRoute;