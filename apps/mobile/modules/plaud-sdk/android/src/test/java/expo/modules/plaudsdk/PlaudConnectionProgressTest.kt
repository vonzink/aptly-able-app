package expo.modules.plaudsdk

import org.junit.Assert.*
import org.junit.Test

class PlaudConnectionProgressTest {
  @Test fun preservesKnownStageAndRejectionWithoutTheSerial() {
    val event = PlaudConnectionProgress.sanitize("private-serial", "private-serial", "first_handshake", "status_1")
    assertEquals(mapOf("stage" to "first_handshake", "detail" to "status_1"), event)
    assertFalse(event.toString().contains("private-serial"))
  }

  @Test fun acceptsEarlyProgressOnlyForAnActiveConnection() {
    assertNotNull(PlaudConnectionProgress.sanitize("assigned", null, "start", "ok"))
    assertNull(PlaudConnectionProgress.sanitize(null, null, "start", "ok"))
    assertNull(PlaudConnectionProgress.sanitize("assigned", "another", "first_handshake", "status_1"))
  }

  @Test fun discardsUnknownStagesAndFreeTextDetails() {
    assertNull(PlaudConnectionProgress.sanitize("assigned", null, "private URL", "token"))
    assertEquals(mapOf("stage" to "pre_handshake", "detail" to "unknown"),
      PlaudConnectionProgress.sanitize("assigned", null, "pre_handshake", "private token"))
  }
}
