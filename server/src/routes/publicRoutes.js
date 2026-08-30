import { Router } from 'express'
import { getBranch, getMovie, getShowSeats, home, listBranches, listMovies } from '../controllers/publicController.js'

const router = Router()
router.get('/home', home)
router.get('/movies', listMovies)
router.get('/movies/:id', getMovie)
router.get('/movies/:id/shows', getMovie)
router.get('/branches', listBranches)
router.get('/branches/:id', getBranch)
router.get('/branches/:id/shows', getBranch)
router.get('/shows/:id/seats', getShowSeats)
export default router
