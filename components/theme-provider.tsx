'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

type ActualThemeProviderProps = React.ComponentProps<typeof NextThemesProvider>;

export function ThemeProvider({ children, ...props }: ActualThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
