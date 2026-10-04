import { Router } from 'express'
import { getBranch, getMovie, getShowSeats, home, listBranches, listMovies, requestMovieAccess, validateMovieApiRequest } from '../controllers/publicController.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
router.get('/home', home)
router.get('/movies', listMovies)
router.post('/movies/:id/request-access', requireAuth, requestMovieAccess)
router.get('/movies/:id/:userId/:apiRequestId', requireAuth, validateMovieApiRequest, getMovie)
router.get('/branches', listBranches)
router.get('/branches/:id', getBranch)
router.get('/branches/:id/shows', getBranch)
router.get('/shows/:id/seats', getShowSeats)
export default router
