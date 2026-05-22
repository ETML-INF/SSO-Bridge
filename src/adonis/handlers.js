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

module.exports = {
  createAdonisSSOHandlers,
  buildAbsoluteUrl,
};
