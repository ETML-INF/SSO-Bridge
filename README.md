# SSO Bridge

## Description
Ce package fournit des helpers SSO orientés framework et un starter interactif qui te propose un template au moment du `npm i`.

## Démarrage rapide
Quand tu installes le package directement avec `npm i edu-sso-bridge`, un wizard peut te demander quel framework tu veux générer. Le starter écrit seulement les fichiers manquants pour éviter d'écraser un projet existant.

Si l'installation est non interactive, lance manuellement le starter avec:
```bash
npx sso-bridge-init
```

## Ce Que Vous Obtenez
- Un coeur SSO agnostique au framework (`src/core/sso-bridge.js`) pour generer des correlation IDs, construire les URLs de redirection SSO, verifier les resultats de callback et construire les URLs de logout.
- Une couche d'integration Adonis (`src/adonis/handlers.js`) avec des handlers prets a l'emploi pour login redirect, callback et logout.
- Des exports CommonJS via `src/index.js`.
- Un starter interactif pour AdonisJS, Express, Fastify, NestJS et Koa.

## Compatibilite Framework
- AdonisJS: couche de helpers native incluse.
- Autres frameworks Node.js (Express, Fastify, NestJS, Koa): utilisez directement la classe core et branchez-la sur vos routes et votre systeme de session.

## Frameworks supportes par le starter
- AdonisJS
- Express
- Fastify
- NestJS
- Koa

## Installation
1. Installez les dependances du package dans votre projet:
	 npm install
2. Ajoutez les variables d'environnement:
	 API_KEY=YOUR_SSO_API_KEY
	 SSO_PORTAL=https://your-sso-portal.example.com/auth/

## Utilisation Adonis

### 1) Creer un service bridge
```js
// On définit l'interface pour avoir l'autocomplétion et éviter les erreurs
interface SsoBridge {
  generateCorrelationId(): Promise<string>
  buildLoginRedirectUrl(correlationId: string, callbackUrl: string): string
  buildLogoutRedirectUrl(redirectUrl: string): string
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
  const config = {
    callbackPath: '/sso/callback',
    afterLogoutPath: '/',
    loginPath: '/sso/login',
    logoutPath: '/sso/logout',
    successRedirect: '/home',
    failureRedirect: '/login',
    authGuard: 'web',
    ...options,
  }

  return {
    async status(ctx: any) {
      return ctx.response.send({
        ok: true,
        loginPath: config.loginPath,
        callbackPath: config.callbackPath,
        logoutPath: config.logoutPath,
        successRedirect: config.successRedirect,
        failureRedirect: config.failureRedirect,
        authGuard: config.authGuard,
      })
    },

    async loginRedirect({ response, request, session }: any) {
      const correlationId = await bridge.generateCorrelationId()
      writeSession(session, 'sso_bridge_correlation_id', correlationId)

      const callbackUrl = buildAbsoluteUrl(request, config.callbackPath)
      const redirectUrl = bridge.buildLoginRedirectUrl(correlationId, callbackUrl)

      return response.redirect(redirectUrl)
    },

    async callbackLogin(ctx: any, createUser: (payload: any) => Promise<any>) {
      const correlationId = readSession(ctx.session, 'sso_bridge_correlation_id')
      const ssoResult = await bridge.retrieveLoginInfo(correlationId)
      const payload = {
        ...ssoResult,
        correlationId,
        raw: ssoResult,
      }

      if (!ssoResult.isSuccess()) {
        return ctx.response.redirect(config.failureRedirect)
      }

      const user = await createUser(payload)
      await ctx.auth.use(config.authGuard).login(user)

      return ctx.response.redirect(config.successRedirect)
    },

    async logout({ auth, response, request }: any) {
      await auth.use(config.authGuard).logout()

      const redirectUrl = buildAbsoluteUrl(request, config.afterLogoutPath)
      return response.redirect(bridge.buildLogoutRedirectUrl(redirectUrl))
    },
  }
}

function readSession(session: any, key: string) {
  if (typeof session?.get === 'function') {
    return session.get(key)
  }

  return undefined
}

function writeSession(session: any, key: string, value: string) {
  if (typeof session?.put === 'function') {
    session.put(key, value)
    return
  }

  if (typeof session?.set === 'function') {
    session.set(key, value)
  }
}

function buildAbsoluteUrl(request: any, path: string) {
  const protocol = typeof request?.protocol === 'function' ? request.protocol() : 'http'
  const host = typeof request?.host === 'function' ? request.host() : 'localhost'
  return new URL(`${protocol}://${host}${path}`).toString()
}

```

### 2) Creer un controller
```js
type SsoResult = {
  email: string
  username: string
  error?: string
  isSuccess: () => boolean
  correlationId?: string
  raw?: {
    roles?: string | string[]
    [key: string]: unknown
  }
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
    return this.flow().callbackLogin(ctx as any, (payload: SsoResult) =>
      this.findOrCreateSsoUser(payload)
    )
  }

  /**
   * PHASE 3 : Déconnexion (Locale + Portail)
   */
  public async logout({ auth, response, request, session }: HttpContext) {
    return this.flow().logout({ auth, response, request, session } as any)
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

