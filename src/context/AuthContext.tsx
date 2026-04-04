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
            const { username } = JSON.parse(stored);

            // Look up user from dummy data
            const userData = dataStore.user_access_master.find(
                (u) => u.username === username
            );

            if (userData) {
                const user = toCamelCase({ ...userData, row_index: userData.id }) as UserPermissions;
                setUserPermissions(user);
                setLoggedIn(true);
            }
            setLoading(false);
        } else {
            setLoading(false);
        }
    }, []);

    async function login(username: string, password: string) {
        // Check credentials against dummy users
        const userData = dataStore.user_access_master.find(
            (u) => u.username === username && u.password === password
        );

        if (!userData) {
            return false;
        }

        const user = toCamelCase({ ...userData, row_index: userData.id }) as UserPermissions;
        localStorage.setItem('auth', JSON.stringify({ username }));
        setUserPermissions(user);
        setLoggedIn(true);
        return true;
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
