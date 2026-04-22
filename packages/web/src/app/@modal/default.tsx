/**
 * Default render for the `@modal` parallel route slot.
 *
 * Returns null when no intercepted route is active — which is the common case
 * on every page that doesn't have a modal open. Next.js requires `default.tsx`
 * on parallel slots; without it, navigation into the slot causes a 404.
 */
export default function ModalDefault() {
  return null;
}
