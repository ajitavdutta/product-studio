import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from '../app/SnackbarProvider';
import { ApiError, apiRequest } from './client';
import type { components } from './types';

export type SettingsRead = components['schemas']['SettingsRead'];
export type SettingsUpdate = components['schemas']['SettingsUpdate'];
export type PiCadence = components['schemas']['PiCadence'];

export const settingsKeys = ['settings'] as const;

/** The server's defaults (backend/app/schemas/settings.py), used when a field is reset. */
export const DEFAULT_PI_CADENCE: PiCadence = { sprintsPerPi: 6, ipSprint: true };
const DEFAULT_DISPLAY_NAME = '';

const SETTINGS_SAVED_MESSAGE = 'Settings saved';
const SAVE_FAILED_MESSAGE = "Couldn't save that change";

/** The settings as the server will return them after `update`; an explicit null resets. */
export function mergeSettings(current: SettingsRead, update: SettingsUpdate): SettingsRead {
  const merged: SettingsRead = { ...current };
  if (update.displayName !== undefined) merged.displayName = update.displayName ?? DEFAULT_DISPLAY_NAME;
  if (update.jiraBaseUrl !== undefined) merged.jiraBaseUrl = update.jiraBaseUrl;
  if (update.defaultPresetId !== undefined) merged.defaultPresetId = update.defaultPresetId;
  if (update.piCadence !== undefined) merged.piCadence = update.piCadence ?? DEFAULT_PI_CADENCE;
  return merged;
}

export function useSettings() {
  return useQuery({
    queryKey: settingsKeys,
    queryFn: () => apiRequest<SettingsRead>('GET', '/settings'),
  });
}

/** G-4: optimistic partial update; rolls back and shows the server's reason on failure. */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  return useMutation({
    mutationFn: (update: SettingsUpdate) => apiRequest<SettingsRead>('PUT', '/settings', update),
    onMutate: async (update) => {
      await queryClient.cancelQueries({ queryKey: settingsKeys });
      const previous = queryClient.getQueryData<SettingsRead>(settingsKeys);
      if (previous) queryClient.setQueryData(settingsKeys, mergeSettings(previous, update));
      return { previous };
    },
    onError: (error, _update, context) => {
      queryClient.setQueryData(settingsKeys, context?.previous);
      snackbar.error(error instanceof ApiError ? error.detail : SAVE_FAILED_MESSAGE);
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(settingsKeys, saved);
      snackbar.notify(SETTINGS_SAVED_MESSAGE);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys });
    },
  });
}
