import type { Role, User } from '@/types'
import { authApi } from '@/api/endpoints'
import { adaptUser } from '@/api/adapt'
import { tokens } from '@/api/http'
import { store } from '@/store/store'

export const authService = {
  async login(identifier: string, password: string, _role: Role, _remember: boolean): Promise<User> {
    const res = await authApi.login(identifier.trim(), password)
    tokens.set(res.access_token, res.refresh_token)
    const user = adaptUser(res.user)
    store.set((d) => {
      d.currentUser = user
      d.bootstrapped = false
    })
    return user
  },

  async restore(): Promise<User | null> {
    if (!tokens.access && !tokens.refresh) return null
    try {
      const dto = await authApi.me()
      const user = adaptUser(dto)
      store.set((d) => {
        d.currentUser = user
      })
      return user
    } catch {
      tokens.clear()
      return null
    }
  },

  logout() {
    const rt = tokens.refresh
    if (rt) authApi.logout(rt).catch(() => {})
    tokens.clear()
    store.reset()
  },
}
