import { normalize } from '@/lib/text';
import { sessionTitle } from './chat-runtime';
import { sessionSourceSearchTerms } from './session-source';
export function sessionMatchesSearch(session, query) {
    const needle = normalize(query);
    if (!needle) {
        return true;
    }
    return [
        session.id,
        session._lineage_root_id ?? '',
        sessionTitle(session),
        session.preview ?? '',
        session.cwd ?? '',
        ...sessionSourceSearchTerms(session.source)
    ].some(value => value.toLowerCase().includes(needle));
}
