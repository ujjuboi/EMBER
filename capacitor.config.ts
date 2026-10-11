import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.ember.lifestyle',
  appName: 'EMBER',
  webDir: 'dist',
  server: { androidScheme: 'https' }, // keeps crypto.subtle / auth in a secure context
  ios: { scheme: 'EMBER' },
}

export default config
