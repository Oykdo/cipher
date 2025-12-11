import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/auth';

export interface UserSettings {
    general?: {
        language?: string;
        theme?: string;
    };
    privacy?: {
        discoverable?: boolean;
        readReceipts?: boolean;
    };
    notifications?: {
        email?: boolean;
        push?: boolean;
    };
    [key: string]: any;
}

async function fetchSettings(token: string): Promise<UserSettings> {
    const response = await fetch(`${API_BASE_URL}/api/v2/settings`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });
    if (!response.ok) {
        throw new Error('Failed to fetch settings');
    }
    return response.json();
}

async function updateSettings(token: string, settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await fetch(`${API_BASE_URL}/api/v2/settings`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
    });
    if (!response.ok) {
        throw new Error('Failed to update settings');
    }
    return response.json();
}

export function useSettings() {
    const { session } = useAuthStore();
    const accessToken = session?.accessToken;
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ['settings'],
        queryFn: () => fetchSettings(accessToken!),
        enabled: !!accessToken,
    });

    const mutation = useMutation({
        mutationFn: (newSettings: Partial<UserSettings>) => updateSettings(accessToken!, newSettings),
        onSuccess: (data) => {
            queryClient.setQueryData(['settings'], data);
        },
    });

    return {
        settings: query.data,
        isLoading: query.isLoading,
        error: query.error,
        updateSettings: mutation.mutate,
        updateSettingsAsync: mutation.mutateAsync,
        isUpdating: mutation.isPending,
    };
}
