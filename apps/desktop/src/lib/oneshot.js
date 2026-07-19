import { $gateway } from '@/store/gateway';
import { $activeSessionId } from '@/store/session';
/**
 * Send a one-off request to Hermes and return the generated text.
 * Throws when the gateway is offline or the backend reports an error.
 */
export async function requestOneShot(req) {
    const gateway = $gateway.get();
    if (!gateway) {
        throw new Error('Gateway not connected');
    }
    const sessionId = req.sessionId === undefined ? $activeSessionId.get() : req.sessionId;
    const result = await gateway.request('llm.oneshot', {
        input: req.input,
        instructions: req.instructions,
        max_tokens: req.maxTokens,
        session_id: sessionId ?? undefined,
        task: req.task,
        temperature: req.temperature,
        template: req.template,
        variables: req.variables
    });
    return (result?.text ?? '').trim();
}
