import express from "express"
import { addMovie, updateMovie, getMovies, getMovie, deleteMovie, getMovieShowtimes, getShowtimes } from "../controller/movieController.js"
import { adminMiddleware, authMiddleware } from "../middleware/middleware.js"

const movieRoute = express.Router()

movieRoute.post('/movies', authMiddleware, adminMiddleware, addMovie)
movieRoute.get('/movies', getMovies)
movieRoute.get('/movies/:id', getMovie)
movieRoute.put('/movies/:id', authMiddleware, adminMiddleware, updateMovie)
movieRoute.delete('/movies/:id', authMiddleware, adminMiddleware, deleteMovie)
movieRoute.get('/movies/:id/showtimes', getMovieShowtimes)
movieRoute.get('/showtimes', getShowtimes)

export default movieRoute