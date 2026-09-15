/** Corporate links/contact verified from aptlyable.com on September 15, 2026.
 * This factual app notice supplements, and does not silently rewrite, the company policy.
 * Store release approval is tracked separately in apps/mobile/store-readiness.json.
 */
export const company = {
  name: 'Aptly Able, LLC',
  supportEmail: 'info@aptlyable.com',
  privacyUrl: 'https://www.aptlyable.com/privacy',
  termsUrl: 'https://www.aptlyable.com/terms',
  accessibilityUrl: 'https://www.aptlyable.com/accessibility',
  supportUrl: 'https://www.aptlyable.com/contact',
} as const;

const deletionEmailSubject = 'Aptly Able account deletion request';

export const accountDeletionRequest = {
  title: 'Delete your Aptly Able account',
  emailSubject: deletionEmailSubject,
  emailUrl: `mailto:${company.supportEmail}?subject=${encodeURIComponent(deletionEmailSubject)}`,
  paragraphs: [
    'You can request deletion of your Aptly Able account and associated service data without installing or signing into the app. Email our monitored support address, info@aptlyable.com, with the subject “Aptly Able account deletion request”. Include your account email and any deletion reference you already have.',
    'Aptly Able support verifies that you own the account before carrying out the request. Send the request from your account email when possible. If you cannot access that email, tell support so we can arrange identity verification. Never send your password or private recordings.',
    'We complete account deletion, including Plaud and backup cleanup, within 7 days of your request. Support can provide your request reference and status updates. Account deletion does not remotely erase your physical recorder or copies you exported.',
  ],
} as const;

export const androidRecorderDisclosure = {
  title: 'Before searching for your recorder',
  description:
    'The Plaud SDK needs Bluetooth / Nearby devices and both precise and approximate location access to find and connect your recorder on Android, including Android 12 and later. When Android asks, enable Precise location; approximate-only access cannot complete setup.\n\nAptly Able does not track your position on a map. Your account identifier and recorder details are shared with Plaud for the connection. The SDK may also keep local diagnostic logs; its full data collection and retention have not yet been verified with Plaud.\n\nYou can decline and keep using your local recordings. Continue only if you agree to this access for recorder setup.',
} as const;

export const appDataNotice = {
  updatedAt: 'September 15, 2026',
  title: 'Privacy & your recordings',
  introduction: 'Understand where your recordings go and how to manage your information.',
  sections: [
    {
      title: 'Your account and recorder',
      paragraphs: [
        'Aptly Able uses your account information and assigned recorder’s model and serial number to sign you in and connect the correct device. Our server shares an account identifier and recorder details with Plaud to authenticate and manage that connection.',
        'Bluetooth connects and controls the recorder. Optional Wi-Fi transfer uses the recorder’s local network. On Android, the Plaud SDK requires Bluetooth / Nearby devices and both precise and approximate location access for recorder discovery and connection, including on Android 12 and later. Approximate-only location access cannot complete setup. You can decline and keep using the local library. Aptly Able does not track your position on a map. On iPhone, the Plaud SDK may request location access to identify the recorder’s Wi-Fi connection; the app does not provide recording-location tracking.',
      ],
    },
    {
      title: 'Audio, notes and transcripts on this phone',
      paragraphs: [
        'Your Plaud recorder captures the audio. This app does not record with the phone’s microphone. You can use your phone keyboard’s dictation feature to write notes.',
        'Received audio uses a temporary cache that can be cleared to save space. Choose Keep offline in app to retain a copy. Your recording titles, notes and imported transcripts are stored with the local library. Copies kept in the app may be included in your device backups, depending on your device settings.',
        'Files you import are available on this device even when you sign out. Recorder downloads are shown for the account that received them. Removing the app removes its local library, but does not delete originals on your recorder, files saved elsewhere, or server copies.',
      ],
    },
    {
      title: 'Cloud transcription',
      paragraphs: [
        'When cloud transcription is available, it is optional. Before an upload, the app asks you to confirm that the selected audio can be sent to Aptly Able and Plaud for AI transcription. Aptly Able stores the uploaded audio, its title and file details, and the resulting transcript. Plaud receives the audio for processing.',
        'Recorder downloads are not automatically uploaded for transcription or cloud backup in this release. You can keep using local playback and notes without requesting cloud transcription. Review generated transcripts against the audio before relying on names, numbers or speaker labels.',
      ],
    },
    {
      title: 'Recording other people',
      paragraphs: [
        'Make sure everyone knows a recording is taking place and that you have permission to record and, if selected, share it for transcription. Follow the rules that apply to your conversation and workplace. Disconnecting the app does not necessarily stop the physical recorder.',
      ],
    },
    {
      title: 'Deletion and retained copies',
      paragraphs: [
        'Delete from app removes that recording’s local audio, notes and imported transcript. The recorder’s original and files saved outside the app remain. Local deletion does not delete audio or transcripts previously uploaded to a server.',
        'Use Settings → Delete account to request removal of your account and associated service data. The request signs you out and prevents further account use while cleanup proceeds. The app provides a reference, due date and a Check deletion status action that works after sign-out. Completion is shown only after all required cleanup is confirmed. If the date passes, the request stays open and the app reports the delay.',
        ...accountDeletionRequest.paragraphs,
        'Keep the device nearby to unpair it first when possible, but you can request account deletion without it.',
      ],
    },
    {
      title: 'Diagnostics and help',
      paragraphs: [
        'Settings can show a diagnostics report with app version, operating system, permission and connection status. It leaves out your email, serial number, recordings, notes and sign-in credentials. Copying the report is your choice; the app does not automatically send that report to support.',
        'The shareable diagnostics report is separate from the Plaud SDK’s diagnostics. The Android SDK can write local network logs containing recorder and authentication details. Its full data collection and retention have not yet been verified with Plaud.',
        'For privacy questions, data requests or help using the app, contact Aptly Able using the support details below. The company Privacy Policy and Terms of Use are available through the links on this page.',
      ],
    },
  ],
} as const;
