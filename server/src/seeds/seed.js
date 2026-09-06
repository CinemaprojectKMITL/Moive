import bcrypt from 'bcrypt'
import { connectDatabase, disconnectDatabase } from '../config/database.js'
import { env } from '../config/env.js'
import { Banner } from '../models/Banner.js'
import { Branch } from '../models/Branch.js'
import { Movie } from '../models/Movie.js'
import { Show } from '../models/Show.js'
import { Theater } from '../models/Theater.js'
import { User } from '../models/User.js'
import { ShowService } from '../services/ShowService.js'
import { logger } from '../utils/logger.js'
import { normalizeUsername } from '../utils/normalize.js'
import { createSeatLayout } from '../utils/seatLayout.js'

const branchSeeds = [
  ['BKK-CENTRAL', 'CEDT Central World', 'ชั้น 7 ศูนย์การค้าเซ็นทรัลเวิลด์ กรุงเทพมหานคร'],
  ['BKK-RAMA9', 'CEDT Rama 9', 'ถนนรัชดาภิเษก เขตห้วยขวาง กรุงเทพมหานคร'],
  ['BKK-BANGKAPI', 'CEDT Bangkapi', 'ถนนลาดพร้าว เขตบางกะปิ กรุงเทพมหานคร'],
  ['NON-RATANA', 'CEDT Rattanathibet', 'ถนนรัตนาธิเบศร์ จังหวัดนนทบุรี'],
  ['SPK-MEGA', 'CEDT Mega Bangna', 'ถนนบางนา-ตราด จังหวัดสมุทรปราการ'],
]

const movieSeeds = [
  { title: 'นคราเหนือกาล', originalTitle: 'Beyond Nakhara', description: 'นักทำแผนที่หนุ่มค้นพบประตูสู่นครโบราณที่ปรากฏเพียงคืนเดือนดับ', durationMinutes: 128, genres: ['ผจญภัย', 'แฟนตาซี'], ageRating: '13+', active: true },
  { title: 'ดาวดวงสุดท้าย', originalTitle: 'The Last Star', description: 'ภารกิจครั้งสุดท้ายของนักบินอวกาศที่ต้องเลือกระหว่างโลกและความจริง', durationMinutes: 142, genres: ['ไซไฟ', 'ดราม่า'], ageRating: '13+', active: true },
  { title: 'เสียงเงียบในโรงแรม', originalTitle: 'Silent Suite', description: 'คืนเดียวในโรงแรมเก่าที่ทุกห้องซ่อนความลับเดียวกัน', durationMinutes: 105, genres: ['ระทึกขวัญ', 'ลึกลับ'], ageRating: '18+', active: true },
  { title: 'วันนั้นของเรา', originalTitle: 'Our Day', description: 'เรื่องราวอบอุ่นของเพื่อนเก่าที่กลับมาพบกันในวันที่เมืองกำลังเปลี่ยนไป', durationMinutes: 116, genres: ['โรแมนติก', 'ดราม่า'], ageRating: 'ทั่วไป', active: true },
  { title: 'ทีมป่วนทะลุมิติ', originalTitle: 'Portal Pals', description: 'ทีมเด็กแสบกับหุ่นยนต์จอมกวนออกเดินทางกู้จักรวาล', durationMinutes: 98, genres: ['แอนิเมชัน', 'ครอบครัว'], ageRating: 'ทั่วไป', active: true },
]

async function seedAdmin() {
  const usernameNormalized = normalizeUsername(env.SEED_ADMIN_USERNAME)
  const passwordHash = await bcrypt.hash(env.SEED_ADMIN_PASSWORD, 12)
  await User.updateOne(
    { usernameNormalized },
    { $setOnInsert: { username: env.SEED_ADMIN_USERNAME, usernameNormalized, passwordHash, displayName: 'Cinema Administrator', role: 'admin', active: true } },
    { upsert: true },
  )
}

async function seedBranchesAndTheaters() {
  const branches = []
  const layout = createSeatLayout(15, 20)
  for (const [code, name, address] of branchSeeds) {
    const branch = await Branch.findOneAndUpdate(
      { code },
      { $set: { name, address, description: `โรงภาพยนตร์พรีเมียม ${name}`, active: true }, $setOnInsert: { code } },
      { upsert: true, returnDocument: 'after' },
    )
    branches.push(branch)
    for (let index = 1; index <= 5; index += 1) {
      await Theater.updateOne(
        { branchId: branch._id, code: `T${index}` },
        { $set: { name: `Theater ${index}`, active: true, seatCount: 300, seatLayout: layout }, $setOnInsert: { branchId: branch._id, code: `T${index}` } },
        { upsert: true },
      )
    }
  }
  return branches
}

async function seedMovies() {
  const movies = []
  for (const data of movieSeeds) {
    movies.push(await Movie.findOneAndUpdate({ title: data.title }, { $set: data, $setOnInsert: { releaseDate: new Date() } }, { upsert: true, returnDocument: 'after' }))
  }
  return movies
}

async function seedBanners() {
  await Banner.findOneAndUpdate(
    { title: 'โลกของภาพยนตร์ เริ่มที่นี่' },
    { $set: { subtitle: 'เลือกเรื่องที่ใช่ รอบที่ชอบ และที่นั่งที่ดีที่สุด', ctaLabel: 'จองตั๋วเลย', ctaUrl: '/branches', enabled: true, sortOrder: 1 } },
    { upsert: true },
  )
  await Banner.findOneAndUpdate(
    { title: 'CEDT Premiere' },
    { $set: { subtitle: 'สัมผัสที่นั่งพรีเมียมและระบบเสียงเหนือระดับ', ctaLabel: 'ดูภาพยนตร์', ctaUrl: '/', enabled: true, sortOrder: 2 } },
    { upsert: true },
  )
}

async function seedShows(branches, movies) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(12, 0, 0, 0)
  for (let branchIndex = 0; branchIndex < branches.length; branchIndex += 1) {
    const theaters = await Theater.find({ branchId: branches[branchIndex]._id }).sort({ code: 1 }).lean()
    for (let slot = 0; slot < 2; slot += 1) {
      const startsAt = new Date(tomorrow.getTime() + slot * 4 * 60 * 60_000 + branchIndex * 10 * 60_000)
      const theater = theaters[slot]
      const movie = movies[(branchIndex + slot) % movies.length]
      const exists = await Show.exists({ theaterId: theater._id, startsAt })
      if (!exists) {
        await ShowService.create({
          movieId: movie._id.toString(), branchId: branches[branchIndex]._id.toString(), theaterId: theater._id.toString(),
          startsAt: startsAt.toISOString(), bookingOpenAt: new Date().toISOString(), bookingCloseAt: startsAt.toISOString(),
          pricing: { normal: 220, premium: 320 }, status: 'open',
        })
      }
    }
  }
}

async function run() {
  await connectDatabase()
  await seedAdmin()
  const branches = await seedBranchesAndTheaters()
  const movies = await seedMovies()
  await seedBanners()
  await seedShows(branches, movies)
  logger.info('seed.completed', { branches: branches.length, theaters: 25, movies: movies.length })
  await disconnectDatabase()
}

run().catch(async (error) => {
  logger.error('seed.failed', { message: error.message, stack: error.stack })
  await disconnectDatabase().catch(() => {})
  process.exitCode = 1
})
