import type { PropsWithChildren } from "react";

export function ThemeProvider({ children }: PropsWithChildren) {
  // The app is hard-pinned to dark mode at the root layout, so we avoid
  // next-themes here and its inline script injection during client rendering.
  return children;
}
