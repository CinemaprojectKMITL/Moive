import { Router } from 'express'
import { imageUpload } from '../middleware/upload.js'
import { validate } from '../middleware/validate.js'
import { bannerSchema, branchSchema, movieSchema, movieUpdateSchema, showSchema, showUpdateSchema, theaterSchema } from '../validators/schemas.js'
import {
  archiveMovie, createBanner, createBranch, createMovie, createShow, createTheater, deleteBanner,
  listBookings, listResource, listShows, updateBanner, updateBranch, updateMovie, updateShow, updateTheater, uploadOwnerImage,
} from '../controllers/adminCatalogController.js'
import { Banner } from '../models/Banner.js'
import { Movie } from '../models/Movie.js'

const router = Router()
router.get('/movies', listResource('movies'))
router.post('/movies', validate(movieSchema), createMovie)
router.patch('/movies/:id', validate(movieUpdateSchema), updateMovie)
router.delete('/movies/:id', archiveMovie)
router.post('/movies/:id/poster', imageUpload((req) => `movies/${req.params.id}`), uploadOwnerImage('movie', Movie, 'posterPath'))

router.get('/branches', listResource('branches'))
router.post('/branches', validate(branchSchema), createBranch)
router.patch('/branches/:id', validate(branchSchema.partial().strict()), updateBranch)

router.get('/theaters', listResource('theaters'))
router.post('/theaters', validate(theaterSchema), createTheater)
router.patch('/theaters/:id', validate(theaterSchema.partial().strict()), updateTheater)

router.get('/shows', listShows)
router.post('/shows', validate(showSchema), createShow)
router.patch('/shows/:id', validate(showUpdateSchema), updateShow)

router.get('/banners', listResource('banners'))
router.post('/banners', validate(bannerSchema), createBanner)
router.patch('/banners/:id', validate(bannerSchema.partial().strict()), updateBanner)
router.delete('/banners/:id', deleteBanner)
router.post('/banners/:id/image', imageUpload(() => 'banners'), uploadOwnerImage('banner', Banner, 'imagePath'))

router.get('/bookings', listBookings)
export default router
