/**
 * Single source of truth for the in-app privacy policy. Rendered by
 * `components/ui/PrivacyDialog.tsx` from the You screen.
 */

export interface PrivacySection {
  heading: string
  body: string
}

export const PRIVACY_UPDATED = 'October 11, 2026'

export const PRIVACY_SECTIONS: PrivacySection[] = [
  {
    heading: 'What we collect',
    body:
      'EMBER is a local-first workout tracker. Everything you create in the app — your account, profile, ' +
      'workout history, plans, partner data, and custom exercises — is stored on your device in an on-device ' +
      'database. There is no EMBER server, no cloud account, and no analytics tracking. Your data is never uploaded.',
  },
  {
    heading: 'Health data',
    body:
      'With your explicit permission, EMBER reads your daily step count from Apple HealthKit (iOS) or Google ' +
      'Health Connect (Android) so you can see your progress toward your step goal. EMBER only reads steps and ' +
      "never writes health data. You can revoke this access at any time in your device's Health / Health Connect " +
      'settings.',
  },
  {
    heading: 'Partner sharing',
    body:
      "If you choose to pair with a partner, your display name, workout history, and step count are sent directly " +
      "to that partner's device over an encrypted peer-to-peer connection. No third party ever sees this data.",
  },
  {
    heading: 'Advertising',
    body: 'EMBER contains no advertising, no ad trackers, and no third-party analytics.',
  },
  {
    heading: 'Contact',
    body:
      'Questions about this policy? Reach out at the address listed on the app store listing for the version you ' +
      'installed.',
  },
]
