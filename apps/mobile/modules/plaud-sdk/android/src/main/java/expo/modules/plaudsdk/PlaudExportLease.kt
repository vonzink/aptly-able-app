package expo.modules.plaudsdk

/** The vendor exporter is process-wide, so React reloads must not reset its exclusion. */
internal class PlaudExportGate {
  private var owner: Any? = null
  @Synchronized fun isBusy(): Boolean = owner != null

  @Synchronized fun acquire(): PlaudExportLease? {
    if (owner != null) return null
    val token = Any()
    owner = token
    return PlaudExportLease {
      synchronized(this) { if (owner === token) owner = null }
    }
  }

  companion object { val shared = PlaudExportGate() }
}

/** Cancellation/stall settles the caller, but only a native terminal callback releases it. */
internal class PlaudExportLease(private val release: () -> Unit) {
  private var terminal = false
  @Synchronized fun finish(beforeRelease: () -> Unit = {}): Boolean {
    if (terminal) return false
    terminal = true
    try { beforeRelease() } finally { release() }
    return true
  }
}
