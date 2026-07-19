export function lastVisibleMessageIsUser(messages) {
    // Allocation-free reverse scan — runs in a hot $messages computed.
    for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (!messages[i].hidden) {
            return messages[i].role === 'user';
        }
    }
    return false;
}
export function threadLoadingState(loadingSession, busy, awaitingResponse, lastVisibleIsUser) {
    if (loadingSession) {
        return 'session';
    }
    if (busy && awaitingResponse && lastVisibleIsUser) {
        return 'response';
    }
    return undefined;
}
