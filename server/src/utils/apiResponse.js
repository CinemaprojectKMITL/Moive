export const sendSuccess = (res, data, status = 200) => res.status(status).json({ success: true, data })
