/** Imperative ref write — extracted so react-compiler doesn't flag hook-arg refs. */
export function setMutableRef(ref, value) {
    ref.current = value;
}
