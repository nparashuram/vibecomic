const configured = (value: string): string | null => (value.trim() ? value : null);

export const getGoogleClientId = () => configured(GOOGLE_CLIENT_ID);
export const getGoogleDeviceClientId = () => configured(GOOGLE_DEVICE_CLIENT_ID);
export const getGoogleDeviceClientSecret = () => configured(GOOGLE_DEVICE_CLIENT_SECRET);
