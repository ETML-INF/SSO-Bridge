function getHostFromRequest(request) {
  if (typeof request.host === "function") {
    return request.host();
  }

  if (typeof request.header === "function") {
    return request.header("host");
  }

  return "localhost";
}

function getProtocolFromRequest(request) {
  if (typeof request.protocol === "function") {
    return request.protocol();
  }

  return "http";
}

function buildAbsoluteUrl(request, path, passthrough = {}) {
  const protocol = getProtocolFromRequest(request);
  const host = getHostFromRequest(request);
  const url = new URL(`${protocol}://${host}${path}`);

  Object.entries(passthrough).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(name, String(value));
    }
  });

  return url.toString();
}

function readSession(session, key) {
  if (typeof session.get === "function") {
    return session.get(key);
  }
  return undefined;
}

function writeSession(session, key, value) {
  if (typeof session.put === "function") {
    session.put(key, value);
    return;
  }

  if (typeof session.set === "function") {
    session.set(key, value);
  }
}

function createAdonisSSOHandlers(bridge, options = {}) {
  const sessionKey = options.sessionKey || "sso_bridge_correlation_id";
  const callbackPath = options.callbackPath || "/sso/callback";
  const afterLogoutPath = options.afterLogoutPath || "/";

  return {
    async loginRedirect(ctx, customRedirectParams = {}) {
      const correlationId = await bridge.generateCorrelationId();
      writeSession(ctx.session, sessionKey, correlationId);

      const callbackUrl = buildAbsoluteUrl(ctx.request, callbackPath, customRedirectParams);
      const redirectUrl = bridge.buildLoginRedirectUrl(correlationId, callbackUrl);

      return ctx.response.redirect(redirectUrl);
    },

    async callback(ctx) {
      const correlationId = readSession(ctx.session, sessionKey);
      const result = await bridge.retrieveLoginInfo(correlationId);

      if (!result.isSuccess()) {
        return ctx.response.status(401).send({ error: result.error });
      }

      return result;
    },

    logout(ctx) {
      const redirectUrl = buildAbsoluteUrl(ctx.request, afterLogoutPath);
      const ssoLogoutUrl = bridge.buildLogoutRedirectUrl(redirectUrl);
      return ctx.response.redirect(ssoLogoutUrl);
    },
  };
}

/**
 * Higher-level Adonis flow helper.
 *
 * Goal: keep app code minimal by moving the SSO plumbing here, while letting the app
 * decide how to provision/find a user in its DB.
 */
function createAdonisSSOFlow(bridge, options = {}) {
  const handlers = createAdonisSSOHandlers(bridge, options);

  const sessionKey = options.sessionKey || "sso_bridge_correlation_id";
  const loginPath = options.loginPath || "/sso/login";
  const logoutPath = options.logoutPath || "/sso/logout";
  const callbackPath = options.callbackPath || "/sso/callback";
  const failureRedirect = options.failureRedirect || "/login";
  const successRedirect = options.successRedirect || "/home";
  const authGuard = options.authGuard || "web";

  return {
    /**
     * GET status JSON with useful links.
     */
    status(ctx) {
      return ctx.response.ok({
        status: "ok",
        links: {
          login: buildAbsoluteUrl(ctx.request, loginPath),
          callback: buildAbsoluteUrl(ctx.request, callbackPath, { correlationId: "XXX" }),
          logout: buildAbsoluteUrl(ctx.request, logoutPath),
        },
      });
    },

    loginRedirect: handlers.loginRedirect,

    /**
     * Validates the SSO callback, provisions a user via the provided function, logs them in,
     * then redirects.
     */
    async callbackLogin(ctx, findOrCreateUser) {
      const correlationId = readSession(ctx.session, sessionKey);
      const result = await bridge.retrieveLoginInfo(correlationId);

      if (!result.isSuccess()) {
        if (ctx.session && typeof ctx.session.flash === "function") {
          ctx.session.flash({ error: result.error || "SSO error" });
        }
        return ctx.response.redirect(failureRedirect);
      }

      const user = await findOrCreateUser(result, ctx);
      if (ctx.auth && typeof ctx.auth.use === "function") {
        await ctx.auth.use(authGuard).login(user);
      }

      return ctx.response.redirect(successRedirect);
    },

    /**
     * Logs out from the app (if ctx.auth exists) and redirects to SSO logout.
     */
    async logout(ctx) {
      if (ctx.auth && typeof ctx.auth.use === "function") {
        try {
          await ctx.auth.use(authGuard).logout();
        } catch (_e) {}
      }

      return handlers.logout(ctx);
    },
  };
}

module.exports = {
  createAdonisSSOHandlers,
  createAdonisSSOFlow,
  buildAbsoluteUrl,
};
