import { Toaster } from '@/components/ui/sonner';
import { fetchSheet, toCamelCase } from '@/lib/fetchers';
import { dataStore } from '@/lib/dummyData';
import type { UserPermissions } from '@/types/sheets';
import React, { createContext, useContext, useEffect, useState } from 'react';

interface AuthState {
    loggedIn: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    logout: () => void;
    loading: boolean;
    user: UserPermissions;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [loggedIn, setLoggedIn] = useState(false);
    const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const stored = localStorage.getItem('auth');
        if (stored) {
            try {
                const { user } = JSON.parse(stored);
                if (user) {
                    const permissions = user.permissions || {};
                    const camelPermissions = toCamelCase(permissions);
                    const flattenedUser = { 
                        ...user, 
                        ...permissions, 
                        ...camelPermissions 
                    };
                    setUserPermissions(flattenedUser);
                    setLoggedIn(true);
                }
            } catch (error) {
                console.error('Session Restoration Error:', error);
                localStorage.removeItem('auth');
            }
        }
        setLoading(false);
    }, []);

    async function login(username: string, password: string) {
        try {
            const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();

            if (data.success) {
                // Manually flatten and ensure both cases are supported for the Sidebar mapping
                const permissions = data.user.permissions || {};
                const camelPermissions = toCamelCase(permissions);
                
                const userData = {
                    ...toCamelCase(data.user),
                    ...permissions, // keeping snake_case as fallback
                    ...camelPermissions, // ensuring camelCase for Sidebar
                    row_index: data.user.id
                } as UserPermissions;

                
                // Store in localStorage
                localStorage.setItem('auth', JSON.stringify({ user: userData }));
                setUserPermissions(userData);
                setLoggedIn(true);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Login Fetch Error:', error);
            return false;
        }
    }

    function logout() {
        localStorage.removeItem('auth');
        setLoggedIn(false);
        setUserPermissions(null);
    }

    return (
        <AuthContext.Provider value={{ login, loggedIn, logout, user: userPermissions!, loading }}>
            {children}
            <Toaster position="top-right" visibleToasts={1} richColors theme="light" closeButton />
        </AuthContext.Provider>
    );
};

export function useAuth() {
    return useContext(AuthContext)!;
}
