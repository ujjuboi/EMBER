import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.ember.gym',
  appName: 'EMBER',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
