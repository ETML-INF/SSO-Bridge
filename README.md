# SSO Bridge

## Description
Ce package fournit des helpers SSO orientés AdonisJS tout en conservant un coeur agnostique au framework.

## Ce Que Vous Obtenez
- Un coeur SSO agnostique au framework (`src/core/sso-bridge.js`) pour generer des correlation IDs, construire les URLs de redirection SSO, verifier les resultats de callback et construire les URLs de logout.
- Une couche d'integration Adonis (`src/adonis/handlers.js`) avec des handlers prets a l'emploi pour login redirect, callback et logout.
- Des exports CommonJS via `src/index.js`.

## Compatibilite Framework
- AdonisJS: couche de helpers native incluse.
- Autres frameworks Node.js (Express, Fastify, NestJS, Koa): utilisez directement la classe core et branchez-la sur vos routes et votre systeme de session.

## Installation
1. Installez les dependances du package dans votre projet:
	 npm install
2. Ajoutez les variables d'environnement:
	 
	 API_KEY=YOUR_SSO_API_KEY
	 
	 SSO_PORTAL=https://your-sso-portal.example.com/auth/

## Example d'Utilisation Adonis

### 1) Creer un service bridge
```js
// app/services/sso_bridge_service.js
import ssoBridgePackage from 'sso-bridge'
import env from '#start/env'

// On définit l'interface pour avoir l'autocomplétion et éviter les erreurs
interface SsoBridge {
  generateCorrelationId(): Promise<string>
  retrieveLoginInfo(correlationId: string): Promise<{
    email: string
    username: string
    error?: string
    isSuccess: () => boolean
  }>
}

/**
 * Initialise le bridge avec les clés du .env
 */
export function createBridgeFromEnv(): SsoBridge {
  const apiKey = env.get('API_KEY') // Ta clé secrète pour parler au bridge
  const ssoPortal = normalizeSsoPortal(env.get('SSO_PORTAL'))

  if (!apiKey) {
    throw new Error('API_KEY (Bridge Token) manquante dans le .env')
  }

  if (!ssoPortal) {
    throw new Error('SSO_PORTAL manquante dans le .env')
  }

  // @ts-ignore - On cast pour utiliser les méthodes du SDK
  return ssoBridgePackage.createSSOBridge({
    apiKey: apiKey,
    ssoPortal: ssoPortal,
  })
}

function normalizeSsoPortal(raw?: string) {
  if (!raw) return undefined

  const trimmed = String(raw).trim()
  if (!trimmed) return undefined

  const withoutTrailingSlash = trimmed.replace(/\/+$/, '')
  const hasAuthSegment = /\/auth(?:\/|$)/.test(withoutTrailingSlash)
  const base = hasAuthSegment ? withoutTrailingSlash : `${withoutTrailingSlash}/auth`
  return `${base}/`
}

export function createAdonisSsoFlowFromEnv(options: any = {}) {
  const bridge = createBridgeFromEnv() as any
  return (ssoBridgePackage as any).createAdonisSSOFlow(bridge, {
    callbackPath: '/sso/callback',
    afterLogoutPath: '/',
    loginPath: '/sso/login',
    logoutPath: '/sso/logout',
    successRedirect: '/home',
    failureRedirect: '/login',
    authGuard: 'web',
    ...options,
  })
}
```

### 2) Creer un controller
```js
// app/controllers/sso_controller.js
import type { HttpContext } from '@adonisjs/core/http'
import { randomBytes } from 'node:crypto'
import Hash from '@adonisjs/core/services/hash'
import { createAdonisSsoFlowFromEnv } from '#services/sso_bridge_service'
import User from '#models/user'

type SsoResult = {
  email: string
  username: string
  error?: string
  isSuccess: () => boolean
}

export default class SsoTestController {
  private flow() {
    return createAdonisSsoFlowFromEnv()
  }

  /**
   * Route de test SSO : GET /sso/test
   * Affiche un état simple et les liens SSO utiles.
   */
  public async status(ctx: HttpContext) {
    return this.flow().status(ctx as any)
  }

  /**
   * PHASE 1 : Redirection vers le portail SSO
   */
  public async loginRedirect({ response, request, session }: HttpContext) {
    return this.flow().loginRedirect({ response, request, session } as any)
  }

  /**
   * PHASE 2 : Retour du portail SSO & Validation
   */
  public async callback(ctx: HttpContext) {
    return this.flow().callbackLogin(ctx as any, (payload: SsoResult) => this.findOrCreateSsoUser(payload))
  }

  /**
   * PHASE 3 : Déconnexion (Locale + Portail)
   */
  public async logout({ auth, response, request, session }: HttpContext) {
    return this.flow().logout({ auth, response, request, session } as any)
  }

  /**
   * LOGIQUE PRIVÉE : Gestion de l'utilisateur en base
   */
  private async findOrCreateSsoUser(payload: SsoResult) {
    const email = payload.email?.trim().toLowerCase() || null
    const usernameFromSso = payload.username?.trim() || ''

    // 1. Recherche (Email d'abord, puis Username)
    let user = email ? await User.findBy('email', email) : null
    if (!user && usernameFromSso) {
      user = await User.findBy('Username', usernameFromSso)
    }

    if (user) return user

    // 2. Création si nouveau
    const baseUsername = this.normalizeUsername(email || usernameFromSso)
    const username = await this.makeUniqueUsername(baseUsername)
    const password = await Hash.make(randomBytes(32).toString('hex'))

    return User.create({
      Username: username,
      email,
      password,
      extainre: false,
      isadmin: false,
    })
  }

  private normalizeUsername(rawEmail: string) {
    const localPart = rawEmail.includes('@') ? rawEmail.split('@')[0] : rawEmail
    const cleaned = localPart
      .trim()
      .replace(/\./g, '-')
      .replace(/[^a-zA-Z0-9_-]/g, '')
    return (cleaned || 'sso_user').slice(0, 40)
  }

  private async makeUniqueUsername(baseUsername: string) {
    let candidate = baseUsername
    let suffix = 1
    while (await User.findBy('Username', candidate)) {
      candidate = `${baseUsername}_${suffix}`.slice(0, 40)
      suffix += 1
    }
    return candidate
  }
}

```

### 3) Definir les routes
```js
// start/routes.js
const Route = use("Route")

Route.get("/sso/login", "SsoController.loginRedirect")
Route.get("/sso/callback", "SsoController.callback")
Route.get("/sso/logout", "SsoController.logout")
```

## Utilisation Generique (Tout Framework)
```js
const { createSSOBridge } = require("sso-bridge")

const bridge = createSSOBridge({
	apiKey: process.env.API_KEY,
	ssoPortal: process.env.SSO_PORTAL,
})

async function startLogin(session, callbackUrl) {
	const cid = await bridge.generateCorrelationId()
	session.sso_bridge_correlation_id = cid
	return bridge.buildLoginRedirectUrl(cid, callbackUrl)
}

async function handleCallback(session) {
	const cid = session.sso_bridge_correlation_id
	return bridge.retrieveLoginInfo(cid)
}
```

## Notes
- `src/core/sso-bridge.js` contient la logique reutilisable independante d'Adonis.
- `src/adonis/handlers.js` fournit des helpers de controller prets a l'emploi pour les contextes Adonis.
- Necessite Node.js 18+ pour `fetch` natif.

