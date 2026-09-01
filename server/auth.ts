import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { config } from './config.js'

export const SESSION_COOKIE = 'northstar_session'

export interface SessionUser {
  id: string
  username: string
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser
    }
  }
}

export function createSession(user: SessionUser) {
  return jwt.sign(user, config.jwtSecret, { expiresIn: '12h', issuer: 'northstar' })
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.cookies?.[SESSION_COOKIE] as string | undefined
  if (!token) return response.status(401).json({ error: 'Authentication required' })

  try {
    request.user = jwt.verify(token, config.jwtSecret, { issuer: 'northstar' }) as SessionUser
    next()
  } catch {
    response.clearCookie(SESSION_COOKIE)
    return response.status(401).json({ error: 'Session expired' })
  }
}
