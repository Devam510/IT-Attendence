"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setThemeState] = useState<Theme>("light");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // Read from localStorage or system preference
        const stored = localStorage.getItem("nexus-theme") as Theme | null;
        if (stored === "light" || stored === "dark") {
            setThemeState(stored);
        } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
            setThemeState("dark");
        }
        setMounted(true);
    }, []);

    useEffect(() => {
        if (mounted) {
            document.documentElement.setAttribute("data-theme", theme);
            localStorage.setItem("nexus-theme", theme);
        }
    }, [theme, mounted]);

    const toggleTheme = useCallback(() => {
        setThemeState(prev => prev === "light" ? "dark" : "light");
    }, []);

    const setTheme = useCallback((t: Theme) => {
        setThemeState(t);
    }, []);

    // Don't return without context — wrap with default values to avoid useTheme() crash
    // (mounted=false just means theme may not be fully initialized yet)
    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    // Safe fallback — never crash, return noop defaults
    if (!context) {
        return {
            theme: "light",
            toggleTheme: () => { },
            setTheme: () => { },
        };
    }
    return context;
}
