package expo.modules.plaudsdk

/** Allowlisted progress only; never forward SDK free text, serials or credentials to JS. */
internal object PlaudConnectionProgress {
  private val stages = setOf(
    "partner_key", "device_signing", "start", "gatt_connect", "set_notify",
    "set_battery_notify", "read_battery", "set_data_notify", "pre_handshake",
    "send_rsa_public", "first_handshake", "two_handshake", "handshake_get_ssn",
    "change_handshake_timeout", "sync_time"
  )
  private val details = setOf(
    "pending", "ok", "old_protocol_ok", "status_0", "status_1", "sn_signature_empty",
    "sn_signature_invalid", "user_rsa_public_key_empty", "bind_token_empty", "send_fail", "failed"
  )
  fun sanitize(activeSerial: String?, reportedSerial: String?, stage: String, detail: String?): Map<String, String?>? {
    if (activeSerial.isNullOrEmpty() || (reportedSerial != null && reportedSerial != activeSerial) || stage !in stages) return null
    return mapOf("stage" to stage, "detail" to if (detail == null || detail in details) detail else "unknown")
  }
}
