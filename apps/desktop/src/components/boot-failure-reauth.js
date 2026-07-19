const DEFAULT_SIGN_IN_COPY = {
    identityProvider: 'your identity provider',
    remoteGateway: 'Sign in to remote gateway',
    withProvider: provider => `Sign in with ${provider}`
};
// A remote, gated (oauth-bucket), not-currently-connected gateway is a
// remote-reauth boot failure: the access cookie lapsed (e.g. the remote
// dashboard restarted) and the local-recovery buttons (Retry/Repair) can't
// fix it — only re-establishing the remote session can. A connected oauth
// session, or a token/local gateway, boots for some other reason the
// local-recovery buttons address, so those return false here.
export function isRemoteReauthFailure(config) {
    if (!config) {
        return false;
    }
    return (config.mode === 'remote' &&
        config.remoteAuthMode === 'oauth' &&
        !config.remoteOauthConnected &&
        Boolean(config.remoteUrl));
}
// Derive the password flag + display label from the probed providers. A
// gateway is treated as password-style only when EVERY advertised provider
// supports password (a mixed deployment keeps the generic OAuth copy), so the
// button copy matches the login window the user is about to see.
export function deriveProviderShape(providers) {
    const list = providers ?? [];
    if (list.length === 0) {
        return { isPassword: false, providerLabel: 'your identity provider' };
    }
    const isPassword = list.every(p => Boolean(p.supportsPassword));
    const providerLabel = list.length === 1 ? list[0].displayName || list[0].name : list.map(p => p.displayName || p.name).join(' / ');
    return { isPassword, providerLabel };
}
// Button copy for the remote sign-in action.
export function signInLabel(reauth, copy = DEFAULT_SIGN_IN_COPY) {
    if (reauth?.isPassword) {
        return copy.remoteGateway;
    }
    const provider = reauth?.providerLabel === DEFAULT_SIGN_IN_COPY.identityProvider ? copy.identityProvider : reauth?.providerLabel;
    return copy.withProvider(provider ?? copy.identityProvider);
}
