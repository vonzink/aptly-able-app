package expo.modules.plaudsdk

import android.Manifest
import android.app.AppOpsManager
import android.app.Activity
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import java.io.File

/** Main-thread owner, independent of React rendering or JS recorder events. */
internal class PlaudRecordingLocation(
  private val context: Context,
  private val activity: () -> Activity?,
  private val changed: (Map<String, Any>) -> Unit
) {
  private val main = Handler(Looper.getMainLooper())
  private val model = RecordingLocationModel(RecordingLocationFileStore(File(context.noBackupFilesDir, "plaud-recording-location/index.json"))) { System.currentTimeMillis() }
  private val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
  private var service: PlaudRecordingLocationService? = null
  private var requestedArm: Long? = null
  private var listener: LocationListener? = null
  private var samplingSource: RecordingLocationSource? = null
  private var sampleGeneration = 0L
  private var requestedPermission = false
  private var issue: String? = null
  private var previousStatus: Map<String, Any>? = null
  private var closed = false
  data class EventContext(val actor: String?, val serial: String?, val generation: Long)
  @Volatile var eventContext = EventContext(null, null, 0); private set

  private val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
  private val permissionListener = AppOpsManager.OnOpChangedListener { _, packageName ->
    if (packageName == context.packageName) main.post { if (!closed) reconcile() }
  }
  private val watchdog = object : Runnable {
    override fun run() {
      if (closed) return
      model.tick()
      reconcile()
      if (service != null || requestedArm != null) main.postDelayed(this, 1000)
    }
  }
  init {
    runCatching {
      appOps?.startWatchingMode(AppOpsManager.OPSTR_COARSE_LOCATION, context.packageName, permissionListener)
      appOps?.startWatchingMode(AppOpsManager.OPSTR_FINE_LOCATION, context.packageName, permissionListener)
    }
  }

  fun visible() = (activity() as? LifecycleOwner)?.lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) == true
  @Suppress("DEPRECATION")
  private fun permissionGranted(permission: String, operation: String): Boolean {
    if (context.checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) return false
    val mode = runCatching { appOps?.checkOpNoThrow(operation, context.applicationInfo.uid, context.packageName) }.getOrNull()
    return mode == null || mode == AppOpsManager.MODE_ALLOWED || mode == AppOpsManager.MODE_DEFAULT ||
      (Build.VERSION.SDK_INT >= 29 && mode == AppOpsManager.MODE_FOREGROUND)
  }
  private fun locationPermission() = permissionGranted(Manifest.permission.ACCESS_FINE_LOCATION, AppOpsManager.OPSTR_FINE_LOCATION) ||
    permissionGranted(Manifest.permission.ACCESS_COARSE_LOCATION, AppOpsManager.OPSTR_COARSE_LOCATION)
  private fun notificationPermission(): Boolean {
    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return false
    val channelEnabled = Build.VERSION.SDK_INT < 26 ||
      notifications.getNotificationChannel(PlaudRecordingLocationService.CHANNEL)?.importance != NotificationManager.IMPORTANCE_NONE
    return (Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) &&
      notifications.areNotificationsEnabled() && channelEnabled
  }
  private fun providers(): List<String> = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter {
    runCatching { manager?.isProviderEnabled(it) == true }.getOrDefault(false)
  }

  fun status(): Map<String, Any> {
    reconcile()
    return statusValue()
  }
  private fun statusValue(): Map<String, Any> {
    val permission = locationPermission()
    val providersAvailable = providers().isNotEmpty()
    val ready = providersAvailable && service != null && permission && notificationPermission() && model.enabled && model.serial != null && model.failure == null
    val reason = when {
      model.failure != null -> "storage"
      !model.enabled -> "off"
      model.serial == null -> "disconnected"
      !permission -> "permission"
      !providersAvailable -> "unavailable"
      !ready -> "background"
      model.capturing && listener != null -> "capturing"
      issue != null -> issue!!
      else -> "ready"
    }
    return mapOf("enabled" to model.enabled,
      "permission" to if (permission) "foreground" else if (requestedPermission || model.enabled) "denied" else "undetermined",
      "backgroundReady" to ready, "capturing" to (model.capturing && listener != null), "reason" to reason)
  }
  private fun publish() {
    eventContext = EventContext(model.actorId, model.serial, model.generation)
    val value = statusValue()
    if (value != previousStatus) { previousStatus = value; changed(value) }
  }

  fun setContext(actor: String?, serial: String?) {
    val before = model.generation
    model.setContext(actor, serial)
    if (before != model.generation) { issue = null; disarm() }
    armIfVisible()
    reconcile()
  }
  fun beginEnable(): RecordingLocationModel.EnablePermit {
    check(model.actorId != null) { "Sign in before enabling recording location" }
    requestedPermission = true
    return model.beginEnable().also { publish() }
  }
  fun completeEnable(permit: RecordingLocationModel.EnablePermit): Map<String, Any> {
    try {
      if (model.completeEnable(permit, locationPermission())) { issue = null; armIfVisible() }
    } finally { reconcile() }
    return statusValue()
  }
  fun disable(): Map<String, Any> {
    try { model.disable() } finally { disarm(); reconcile() }
    return statusValue()
  }
  fun refreshReadiness(): Map<String, Any> { armIfVisible(); return status() }
  fun get(source: RecordingLocationSource) = model.get(source)?.bridge()
  fun remove(source: RecordingLocationSource) {
    try { model.remove(source) } finally { reconcile() }
  }
  fun clear(actor: String) {
    try { model.clear(actor) } finally { if (!model.enabled) disarm(); reconcile() }
  }
  fun disconnect() { model.disconnect(); issue = "disconnected"; disarm(); reconcile() }
  fun sdkReset(actor: String?) { model.sdkReset(actor); issue = "interrupted"; disarm(); reconcile() }

  fun recording(event: EventContext, session: Long, action: String) {
    if (event != eventContext || event.actor == null || event.serial == null || closed) return
    val source = RecordingLocationSource(event.actor, event.serial, session)
    reconcile()
    when (action) {
      "start", "resume" -> if (model.start(source, action == "resume")) issue = null
      "pause" -> model.pause(source)
      "stop" -> model.stop(source)
    }
    reconcile()
  }

  fun recorderIdle(event: EventContext) {
    if (event != eventContext || closed) return
    model.recorderIdle(); reconcile()
  }

  fun shutdown() {
    if (closed) return
    model.shutdown(); disarm(); closed = true
    main.removeCallbacks(watchdog)
    runCatching { appOps?.stopWatchingMode(permissionListener) }
    publish()
  }

  private fun armIfVisible() {
    if (closed || service != null || requestedArm != null || !model.enabled || model.actorId == null || model.serial == null || model.failure != null) return
    if (!visible() || !notificationPermission() || !locationPermission()) { issue = "background"; publish(); return }
    if (providers().isEmpty()) { issue = "unavailable"; publish(); return }
    try {
      val token = PlaudRecordingLocationService.nextToken()
      requestedArm = token
      PlaudRecordingLocationService.owner = this
      val intent = Intent(context, PlaudRecordingLocationService::class.java).putExtra("armToken", token)
      if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
      main.removeCallbacks(watchdog); main.postDelayed(watchdog, 1000)
    } catch (_: Exception) { requestedArm = null; issue = "background"; disarm() }
    publish()
  }

  fun attach(candidate: PlaudRecordingLocationService, token: Long): Boolean {
    if (closed || token != requestedArm || !visible() || !model.enabled || model.serial == null || model.failure != null || !locationPermission() || !notificationPermission()) return false
    return try {
      candidate.promote()
      requestedArm = null; service = candidate; issue = null
      model.readiness(true, true)
      reconcile()
      true
    } catch (_: Exception) { requestedArm = null; issue = "background"; reconcile(); false }
  }
  fun keepsServiceAlive(candidate: PlaudRecordingLocationService): Boolean =
    !closed && PlaudRecordingLocationService.owner === this && (requestedArm != null || service === candidate)

  fun rejectedArm(token: Long) {
    if (requestedArm != token) return
    requestedArm = null; issue = "background"; reconcile()
  }
  fun serviceStopped(candidate: PlaudRecordingLocationService) {
    if (service !== candidate) return
    service = null; issue = "background"; model.readiness(locationPermission(), false)
    stopSampling(); publish()
  }
  fun taskRemoved(candidate: PlaudRecordingLocationService) {
    if (service !== candidate) return
    model.interrupt("background"); issue = "background"; disarm(); reconcile()
  }
  private fun disarm() {
    requestedArm = null
    stopSampling()
    val old = service; service = null
    if (PlaudRecordingLocationService.owner === this) {
      PlaudRecordingLocationService.owner = null
      runCatching { old?.finish() }
      // An old Expo module must not stop a newer module's process-wide service.
      runCatching { context.stopService(Intent(context, PlaudRecordingLocationService::class.java)) }
    }
    main.removeCallbacks(watchdog)
    model.readiness(locationPermission(), false)
  }
  private fun reconcile() {
    if (closed) return
    val permitted = locationPermission()
    if (!model.enabled || model.serial == null || model.failure != null || !permitted || !notificationPermission()) {
      model.readiness(permitted, false)
      if (service != null || requestedArm != null || listener != null) disarm()
    } else {
      model.readiness(true, service != null)
    }
    if (!model.capturing) stopSampling()
    else if (listener == null || samplingSource != model.currentSource) startSampling()
    publish()
  }
  private fun stopSampling() {
    sampleGeneration++
    listener?.let { runCatching { manager?.removeUpdates(it) } }
    listener = null; samplingSource = null
  }
  @Suppress("DEPRECATION")
  private fun startSampling() {
    stopSampling()
    val source = model.currentSource ?: return
    val generation = sampleGeneration
    val callback = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        if (generation != sampleGeneration || samplingSource != source || closed) return
        if (!locationPermission()) { reconcile(); return }
        model.point(source, RecordingLocationPoint(location.latitude, location.longitude,
          if (location.hasAccuracy()) location.accuracy.toDouble() else Double.NaN, location.time))
        reconcile()
      }
      override fun onProviderDisabled(provider: String) {
        if (generation != sampleGeneration) return
        if (providers().isEmpty()) { model.interrupt("unavailable"); issue = "unavailable"; reconcile() }
      }
      override fun onProviderEnabled(provider: String) = Unit
      override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
    }
    listener = callback; samplingSource = source
    var requested = false
    for (provider in providers()) {
      try {
        manager?.requestLocationUpdates(provider, LOCATION_INTERVAL, 0f, callback, Looper.getMainLooper())
        if (manager != null) requested = true
      } catch (_: Exception) { /* Try another system provider; never fail recorder audio. */ }
    }
    if (!requested) { model.interrupt(if (locationPermission()) "unavailable" else "permission"); issue = "unavailable"; stopSampling() }
  }
}
