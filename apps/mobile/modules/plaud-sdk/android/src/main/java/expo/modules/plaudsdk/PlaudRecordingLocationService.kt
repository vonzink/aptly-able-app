package expo.modules.plaudsdk

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import java.util.concurrent.atomic.AtomicLong

/** Explicitly armed while visible; no boot hook, background permission or sticky restart. */
class PlaudRecordingLocationService : Service() {
  companion object {
    internal const val CHANNEL = "plaud-recording-location"
    private const val NOTIFICATION = 7321
    private val tokens = AtomicLong()
    internal var owner: PlaudRecordingLocation? = null
    internal fun nextToken() = tokens.incrementAndGet()
  }
  private var attachedOwner: PlaudRecordingLocation? = null
  override fun onBind(intent: Intent?): IBinder? = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val token = intent?.getLongExtra("armToken", -1) ?: -1
    val candidate = owner
    if (candidate != null && candidate.attach(this, token)) attachedOwner = candidate
    else {
      candidate?.rejectedArm(token)
      // A stale intent may arrive while a newer owner's valid arm is queued. Do not
      // stop that service request or remove an already valid owner's notification.
      if (candidate?.keepsServiceAlive(this) != true && attachedOwner?.keepsServiceAlive(this) != true) {
        if (stopSelfResult(startId)) stopForeground(STOP_FOREGROUND_REMOVE)
      }
    }
    return START_NOT_STICKY
  }
  @Suppress("DEPRECATION")
  internal fun promote() {
    val notifications = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(
      NotificationChannel(CHANNEL, "Recording location", NotificationManager.IMPORTANCE_LOW).apply {
        description = "Shows when optional recording location is ready."
        setShowBadge(false)
      })
    // Package launch intents contain an explicit component. No session/account/location data.
    val launch = packageManager.getLaunchIntentForPackage(packageName) ?: error("App launch activity unavailable")
    check(launch.component != null)
    val open = PendingIntent.getActivity(this, 0, launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    val notification = builder.setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("Recording location is enabled")
      .setContentText("Location is saved only while your connected recorder is recording.")
      .setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true)
      .setVisibility(Notification.VISIBILITY_PRIVATE)
      .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_view, "Open app", open).build())
      .build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
    else startForeground(NOTIFICATION, notification)
  }
  internal fun finish() { stopForeground(STOP_FOREGROUND_REMOVE); stopSelf() }
  override fun onTaskRemoved(rootIntent: Intent?) { attachedOwner?.taskRemoved(this); finish(); super.onTaskRemoved(rootIntent) }
  override fun onDestroy() { attachedOwner?.serviceStopped(this); attachedOwner = null; super.onDestroy() }
}
