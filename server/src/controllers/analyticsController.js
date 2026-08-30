import { AnalyticsService } from '../services/AnalyticsService.js'
import { asyncHandler } from '../utils/asyncHandler.js'
import { sendSuccess } from '../utils/apiResponse.js'

export const dashboard = asyncHandler(async (req, res) => sendSuccess(res, await AnalyticsService.dashboard(req.query)))
