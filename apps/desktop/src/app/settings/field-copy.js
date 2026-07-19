function schemaSegmentToFieldCopySegment(segment) {
    return segment.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
}
function isFieldCopyTree(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function schemaKeyToFieldCopyKey(schemaKey) {
    return schemaKey.split('.').map(schemaSegmentToFieldCopySegment).join('.');
}
export function fieldCopyForSchemaKey(copy, schemaKey) {
    return copy[schemaKeyToFieldCopyKey(schemaKey)] ?? copy[schemaKey];
}
export function defineFieldCopy(copy) {
    const result = {};
    const visit = (node, prefix = []) => {
        for (const [key, value] of Object.entries(node)) {
            const parts = key.split('.');
            if (parts.some(part => part.length === 0)) {
                throw new Error(`Invalid field copy key: ${[...prefix, key].join('.')}`);
            }
            const path = [...prefix, ...parts];
            if (typeof value === 'string') {
                const flatKey = path.join('.');
                if (Object.prototype.hasOwnProperty.call(result, flatKey)) {
                    throw new Error(`Duplicate field copy key: ${flatKey}`);
                }
                result[flatKey] = value;
                continue;
            }
            if (!isFieldCopyTree(value)) {
                throw new Error(`Invalid field copy value for key: ${path.join('.')}`);
            }
            visit(value, path);
        }
    };
    visit(copy);
    return result;
}
