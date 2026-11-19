interface CapacitorAndroidConfig {
  appId: string;
  appName: string;
  webDir: string;
  android: {
    allowMixedContent: boolean;
    captureInput: boolean;
    webContentsDebuggingEnabled: boolean;
  };
  server: {
    androidScheme: 'https' | 'http';
  };
}

const config: CapacitorAndroidConfig = {
  appId: 'com.iskenderozkul.recon3d',
  appName: '3Drecon Studio',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
